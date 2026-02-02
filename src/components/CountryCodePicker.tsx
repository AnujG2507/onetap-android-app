import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import {
  type CountryCode,
  type CountryData,
  getCountryData,
  getAllCountries,
  getPopularCountries,
  getDefaultCountry,
  searchCountries,
} from '@/lib/phoneUtils';

interface CountryCodePickerProps {
  selectedCountry: CountryCode | null;
  onSelect: (country: CountryCode) => void;
  disabled?: boolean;
}

export function CountryCodePicker({
  selectedCountry,
  onSelect,
  disabled = false,
}: CountryCodePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Get selected country data (null = empty state)
  const selectedData = useMemo(
    () => (selectedCountry ? getCountryData(selectedCountry) : null),
    [selectedCountry]
  );

  // Get all countries (memoized)
  const allCountries = useMemo(() => getAllCountries(), []);

  // Get popular countries with device locale first
  const localeCountry = useMemo(() => getDefaultCountry(), []);
  const popularCountries = useMemo(
    () => getPopularCountries(localeCountry),
    [localeCountry]
  );

  // Filter countries based on search
  const filteredCountries = useMemo(
    () => searchCountries(searchQuery, allCountries),
    [searchQuery, allCountries]
  );

  const handleSelect = useCallback(
    (country: CountryCode) => {
      onSelect(country);
      setOpen(false);
      setSearchQuery('');
    },
    [onSelect]
  );

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  }, []);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="h-12 px-3 gap-1 rounded-xl shrink-0 min-w-[90px]"
        >
          {selectedData ? (
            <>
              <span className="text-lg leading-none">{selectedData.flag}</span>
              <span className="text-sm font-medium">{selectedData.dialCode}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{t('phoneInput.selectCountry')}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground ms-0.5" />
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>{t('phoneInput.selectCountry')}</DrawerTitle>
        </DrawerHeader>

        {/* Search Input */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('phoneInput.searchCountry')}
              className="h-10 ps-9 rounded-lg"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="px-4 pb-6">
            {/* Popular Countries Section (only when not searching) */}
            {!searchQuery && (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {t('phoneInput.popularCountries')}
                </p>
                <div className="space-y-1 mb-4">
                  {popularCountries.map((country) => (
                    <CountryOption
                      key={`popular-${country.code}`}
                      country={country}
                      isSelected={country.code === selectedCountry}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>

                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {t('phoneInput.allCountries')}
                </p>
              </>
            )}

            {/* All Countries / Search Results */}
            <div className="space-y-1">
              {filteredCountries.map((country) => (
                <CountryOption
                  key={country.code}
                  country={country}
                  isSelected={country.code === selectedCountry}
                  onSelect={handleSelect}
                />
              ))}
              {filteredCountries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No countries found
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

// Individual country option component
interface CountryOptionProps {
  country: CountryData;
  isSelected: boolean;
  onSelect: (code: CountryCode) => void;
}

function CountryOption({ country, isSelected, onSelect }: CountryOptionProps) {
  return (
    <button
      onClick={() => onSelect(country.code)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
        'hover:bg-muted/50 active:bg-muted',
        isSelected && 'bg-primary/10'
      )}
    >
      <span className="text-xl leading-none">{country.flag}</span>
      <span className="flex-1 text-start text-sm font-medium truncate">
        {country.name}
      </span>
      <span className="text-sm text-muted-foreground">{country.dialCode}</span>
      {isSelected && (
        <Check className="h-4 w-4 text-primary shrink-0" />
      )}
    </button>
  );
}
