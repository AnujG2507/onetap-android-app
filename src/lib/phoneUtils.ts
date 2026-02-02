// Phone number utilities using libphonenumber-js
import {
  parsePhoneNumber,
  isValidPhoneNumber,
  getCountryCallingCode,
  getCountries,
  AsYouType,
  type CountryCode,
} from 'libphonenumber-js';

export type { CountryCode };

export interface ParsedPhone {
  countryCode: CountryCode;
  nationalNumber: string;
  e164: string;
}

export interface CountryData {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
}

export type ValidationResult = 'valid' | 'too_short' | 'too_long' | 'invalid' | 'empty';

/**
 * Parse a phone number string and extract country code and national number
 */
export function parsePhone(input: string, defaultCountry?: CountryCode): ParsedPhone | null {
  if (!input || input.trim().length === 0) return null;
  
  try {
    const parsed = parsePhoneNumber(input, defaultCountry);
    if (parsed && parsed.country) {
      return {
        countryCode: parsed.country,
        nationalNumber: parsed.nationalNumber,
        e164: parsed.number,
      };
    }
  } catch {
    // Try with default country if provided
    if (defaultCountry) {
      try {
        const parsed = parsePhoneNumber(input, defaultCountry);
        if (parsed && parsed.country) {
          return {
            countryCode: parsed.country,
            nationalNumber: parsed.nationalNumber,
            e164: parsed.number,
          };
        }
      } catch {
        // Parsing failed
      }
    }
  }
  return null;
}

/**
 * Validate a phone number and return the validation status
 */
export function validatePhoneNumber(input: string, countryCode: CountryCode): ValidationResult {
  if (!input || input.trim().length === 0) return 'empty';
  
  // Remove all non-digit characters for length checking
  const digits = input.replace(/\D/g, '');
  
  try {
    const parsed = parsePhoneNumber(input, countryCode);
    if (parsed) {
      if (parsed.isValid()) {
        return 'valid';
      }
      // Check if it might be too short or too long
      if (digits.length < 5) {
        return 'too_short';
      }
      if (digits.length > 15) {
        return 'too_long';
      }
    }
  } catch {
    // Parsing error
  }
  
  // Simple length checks for partial input
  if (digits.length < 4) {
    return 'too_short';
  }
  if (digits.length > 15) {
    return 'too_long';
  }
  
  // Check validity with the library
  try {
    if (isValidPhoneNumber(input, countryCode)) {
      return 'valid';
    }
  } catch {
    // Validation error
  }
  
  return 'invalid';
}

/**
 * Format a phone number as the user types (national format)
 */
export function formatAsYouType(input: string, countryCode: CountryCode): string {
  if (!input) return '';
  
  const formatter = new AsYouType(countryCode);
  return formatter.input(input);
}

/**
 * Convert a phone number to E.164 format
 */
export function toE164(input: string, countryCode: CountryCode): string | null {
  try {
    const parsed = parsePhoneNumber(input, countryCode);
    if (parsed) {
      return parsed.number;
    }
  } catch {
    // Parsing failed
  }
  return null;
}

/**
 * Detect country from a phone number string
 */
export function detectCountryFromNumber(input: string): CountryCode | null {
  if (!input) return null;
  
  try {
    const parsed = parsePhoneNumber(input);
    if (parsed && parsed.country) {
      return parsed.country;
    }
  } catch {
    // Detection failed
  }
  return null;
}

/**
 * Get the default country based on device locale
 */
export function getDefaultCountry(): CountryCode {
  try {
    // Try to get from browser locale
    const locale = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en-US';
    const parts = locale.split('-');
    if (parts.length >= 2) {
      const countryCode = parts[parts.length - 1].toUpperCase();
      // Verify it's a valid country code
      const allCountries = getCountries();
      if (allCountries.includes(countryCode as CountryCode)) {
        return countryCode as CountryCode;
      }
    }
  } catch {
    // Fallback
  }
  return 'US';
}

/**
 * Convert a country code to emoji flag
 */
export function countryCodeToFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

/**
 * Get localized country name using Intl API
 */
export function getCountryName(code: CountryCode, locale: string = 'en'): string {
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
    const name = displayNames.of(code);
    return name || code;
  } catch {
    return code;
  }
}

/**
 * Get data for a single country
 */
export function getCountryData(code: CountryCode): CountryData {
  return {
    code,
    name: getCountryName(code),
    dialCode: `+${getCountryCallingCode(code)}`,
    flag: countryCodeToFlag(code),
  };
}

/**
 * Get all countries sorted alphabetically by name
 */
export function getAllCountries(): CountryData[] {
  return getCountries()
    .map(code => getCountryData(code))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get popular countries, with locale country first if available
 */
export function getPopularCountries(localeCountry?: CountryCode): CountryData[] {
  const popularCodes: CountryCode[] = ['US', 'GB', 'IN', 'DE', 'FR', 'BR', 'MX', 'CA', 'AU'];
  
  // Put locale country first if not already in the list
  if (localeCountry && !popularCodes.includes(localeCountry)) {
    popularCodes.unshift(localeCountry);
  } else if (localeCountry && popularCodes.includes(localeCountry)) {
    // Move locale country to front
    const index = popularCodes.indexOf(localeCountry);
    popularCodes.splice(index, 1);
    popularCodes.unshift(localeCountry);
  }
  
  return popularCodes.map(code => getCountryData(code));
}

/**
 * Search countries by name, code, or dial code
 */
export function searchCountries(query: string, countries: CountryData[]): CountryData[] {
  if (!query.trim()) return countries;
  
  const lowerQuery = query.toLowerCase().trim();
  const dialQuery = query.startsWith('+') ? query : `+${query}`;
  
  return countries.filter(country => 
    country.name.toLowerCase().includes(lowerQuery) ||
    country.code.toLowerCase().includes(lowerQuery) ||
    country.dialCode.includes(dialQuery) ||
    country.dialCode.includes(query)
  );
}
