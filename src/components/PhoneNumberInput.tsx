import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, UserCircle2, Check, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CountryCodePicker } from '@/components/CountryCodePicker';
import { cn } from '@/lib/utils';
import {
  type CountryCode,
  parsePhone,
  validatePhoneNumber,
  formatAsYouType,
  toE164,
  getDefaultCountry,
  detectCountryFromNumber,
} from '@/lib/phoneUtils';


interface PhoneNumberInputProps {
  value: string; // E.164 or partial
  onChange: (e164: string, isValid: boolean) => void;
  defaultCountry?: CountryCode;
  placeholder?: string;
  disabled?: boolean;
  onPickContact?: () => void;
  className?: string;
}

export function PhoneNumberInput({
  value,
  onChange,
  defaultCountry,
  placeholder,
  disabled = false,
  onPickContact,
  className,
}: PhoneNumberInputProps) {
  const { t } = useTranslation();

  // Determine initial country from value or default
  const initialCountry = useMemo(() => {
    if (value) {
      const detected = detectCountryFromNumber(value);
      if (detected) return detected;
    }
    return defaultCountry || getDefaultCountry();
  }, []);

  const [countryCode, setCountryCode] = useState<CountryCode>(initialCountry);
  const [nationalNumber, setNationalNumber] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Parse incoming value to split country/national on mount and when value changes externally
  useEffect(() => {
    if (value) {
      const parsed = parsePhone(value, countryCode);
      if (parsed) {
        setCountryCode(parsed.countryCode);
        // Format the national number for display
        const formatted = formatAsYouType(parsed.nationalNumber, parsed.countryCode);
        setNationalNumber(formatted || parsed.nationalNumber);
      } else {
        // If can't parse, just use the value as-is (might be partial)
        const cleaned = value.replace(/^\+\d+\s*/, ''); // Remove country code if present
        setNationalNumber(cleaned);
      }
    } else {
      setNationalNumber('');
    }
  }, [value]);

  // Validation state
  const validationResult = useMemo(() => {
    if (!nationalNumber.trim()) return 'empty';
    return validatePhoneNumber(nationalNumber, countryCode);
  }, [nationalNumber, countryCode]);

  const isValid = validationResult === 'valid';
  const hasError = validationResult !== 'valid' && validationResult !== 'empty' && nationalNumber.length > 3;

  // Get validation message
  const getValidationMessage = useCallback(() => {
    switch (validationResult) {
      case 'too_short':
        return t('phoneInput.tooShort');
      case 'too_long':
        return t('phoneInput.tooLong');
      case 'invalid':
        return t('phoneInput.invalidNumber');
      default:
        return '';
    }
  }, [validationResult, t]);

  // Handle national number change
  const handleNationalNumberChange = useCallback(
    (input: string) => {
      // Format as user types
      const formatted = formatAsYouType(input, countryCode);
      setNationalNumber(formatted || input);

      // Convert to E.164 and notify parent
      const e164 = toE164(input, countryCode);
      const validation = validatePhoneNumber(input, countryCode);
      onChange(e164 || input, validation === 'valid');
    },
    [countryCode, onChange]
  );

  // Handle country change
  const handleCountryChange = useCallback(
    (newCountry: CountryCode) => {
      setCountryCode(newCountry);

      // Re-validate and convert with new country
      if (nationalNumber) {
        const e164 = toE164(nationalNumber, newCountry);
        const validation = validatePhoneNumber(nationalNumber, newCountry);
        onChange(e164 || nationalNumber, validation === 'valid');
      }
    },
    [nationalNumber, onChange]
  );

  // Handle clear
  const handleClear = useCallback(() => {
    setNationalNumber('');
    onChange('', false);
  }, [onChange]);

  // Handle paste - detect if it's an international number
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData('text');
      
      // Check if it looks like an international number
      if (pastedText.startsWith('+')) {
        e.preventDefault();
        const parsed = parsePhone(pastedText);
        if (parsed) {
          setCountryCode(parsed.countryCode);
          const formatted = formatAsYouType(parsed.nationalNumber, parsed.countryCode);
          setNationalNumber(formatted || parsed.nationalNumber);
          onChange(parsed.e164, true);
          return;
        }
      }
      // Otherwise, let default paste behavior happen
    },
    [onChange]
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2">
        {/* Country Code Picker */}
        <CountryCodePicker
          selectedCountry={countryCode}
          onSelect={handleCountryChange}
          disabled={disabled}
        />

        {/* National Number Input */}
        <div className="relative flex-1">
          <Input
            type="tel"
            value={nationalNumber}
            onChange={(e) => handleNationalNumberChange(e.target.value)}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder || t('contact.phonePlaceholder')}
            disabled={disabled}
            className={cn(
              'h-12 text-lg pe-10 rounded-xl',
              hasError && 'border-destructive focus-visible:ring-destructive',
              isValid && nationalNumber && 'border-green-500 focus-visible:ring-green-500'
            )}
          />

          {/* Status Icon / Clear Button */}
          <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isValid && nationalNumber && (
              <Check className="h-4 w-4 text-green-500" />
            )}
            {hasError && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
            {nationalNumber && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                aria-label={t('common.clearText')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Contact Picker Button (optional) */}
        {onPickContact && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onPickContact}
            disabled={disabled}
            className="h-12 w-12 shrink-0 rounded-xl"
            aria-label={t('contact.pickFromContacts')}
          >
            <UserCircle2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Validation Error Message */}
      {hasError && (
        <p className="text-sm text-destructive animate-fade-in">
          {getValidationMessage()}
        </p>
      )}
    </div>
  );
}
