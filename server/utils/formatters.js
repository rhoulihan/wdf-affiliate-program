/**
 * Formatter Utilities
 * Provides consistent data formatting functions for currency, dates, addresses, etc.
 * Reduces code duplication across controllers and services
 */

class Formatters {
  /**
   * Format currency values
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code (default: USD)
   * @param {string} locale - Locale for formatting (default: en-US)
   */
  static currency(amount, currency = 'USD', locale = 'en-US') {
    if (amount === null || amount === undefined) {
      return '$0.00';
    }

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (error) {
      // Fallback for invalid locale or currency
      return `$${Number(amount).toFixed(2)}`;
    }
  }

  /**
   * Format date values
   * @param {Date|string} date - Date to format
   * @param {string} format - Format style: 'short', 'medium', 'long', 'full'
   * @param {string} locale - Locale for formatting
   */
  static date(date, format = 'short', locale = 'en-US') {
    if (!date) {
      return '';
    }

    try {
      const dateObj = date instanceof Date ? date : new Date(date);

      if (isNaN(dateObj.getTime())) {
        return '';
      }

      const options = {
        short: { dateStyle: 'short' },
        medium: { dateStyle: 'medium' },
        long: { dateStyle: 'long' },
        full: { dateStyle: 'full' },
        datetime: {
          dateStyle: 'medium',
          timeStyle: 'short'
        },
        time: { timeStyle: 'short' },
        iso: null // Special case for ISO format
      };

      if (format === 'iso') {
        return dateObj.toISOString();
      }

      return new Intl.DateTimeFormat(locale, options[format] || options.short)
        .format(dateObj);
    } catch (error) {
      return String(date);
    }
  }

  /**
   * Format datetime with custom format
   * @param {Date|string} date - Date to format
   * @param {Object} options - Intl.DateTimeFormat options
   * @param {string} locale - Locale for formatting
   */
  static datetime(date, options = {}, locale = 'en-US') {
    if (!date) {
      return '';
    }

    try {
      const dateObj = date instanceof Date ? date : new Date(date);

      if (isNaN(dateObj.getTime())) {
        return '';
      }

      const defaultOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        ...options
      };

      return new Intl.DateTimeFormat(locale, defaultOptions).format(dateObj);
    } catch (error) {
      return String(date);
    }
  }

  /**
   * Format relative time (e.g., "2 hours ago")
   * @param {Date|string} date - Date to format
   * @param {string} locale - Locale for formatting
   */
  static relativeTime(date, locale = 'en-US') {
    if (!date) {
      return '';
    }

    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      const now = new Date();
      const diffMs = now - dateObj;
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

      if (Math.abs(diffDays) > 0) {
        return rtf.format(-diffDays, 'day');
      } else if (Math.abs(diffHours) > 0) {
        return rtf.format(-diffHours, 'hour');
      } else if (Math.abs(diffMins) > 0) {
        return rtf.format(-diffMins, 'minute');
      } else {
        return rtf.format(-diffSecs, 'second');
      }
    } catch (error) {
      return String(date);
    }
  }

  /**
   * Format address from customer object
   * @param {Object} customer - Customer object with address fields
   * @param {string} format - Format style: 'single', 'multi', 'short'
   */
  static address(customer, format = 'single') {
    if (!customer) {
      return '';
    }

    const parts = [];

    if (customer.address) parts.push(customer.address);
    if (customer.address2) parts.push(customer.address2);

    const cityStateZip = [];
    if (customer.city) cityStateZip.push(customer.city);
    if (customer.state) cityStateZip.push(customer.state);
    if (customer.zipCode) cityStateZip.push(customer.zipCode);

    switch (format) {
    case 'multi':
      // Multi-line format
      const lines = [...parts];
      if (cityStateZip.length > 0) {
        lines.push(cityStateZip.join(', '));
      }
      return lines.join('\n');

    case 'short':
      // Short format (city, state only)
      return [customer.city, customer.state].filter(Boolean).join(', ');

    case 'single':
    default:
      // Single line format
      if (cityStateZip.length > 0) {
        parts.push(cityStateZip.join(', '));
      }
      return parts.join(', ');
    }
  }

  /**
   * Format phone number
   * @param {string} phone - Phone number to format
   * @param {string} format - Format style: 'us', 'international', 'dots'
   */
  static phone(phone, format = 'us') {
    if (!phone) {
      return '';
    }

    // Remove all non-digits
    const cleaned = String(phone).replace(/\D/g, '');

    if (cleaned.length === 0) {
      return phone;
    }

    switch (format) {
    case 'us':
      if (cleaned.length === 10) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
      } else if (cleaned.length === 11 && cleaned[0] === '1') {
        return cleaned.replace(/1(\d{3})(\d{3})(\d{4})/, '+1 ($1) $2-$3');
      }
      break;

    case 'dots':
      if (cleaned.length === 10) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1.$2.$3');
      }
      break;

    case 'international':
      if (cleaned.length === 10) {
        return '+1 ' + cleaned;
      } else if (cleaned.length === 11 && cleaned[0] === '1') {
        return '+' + cleaned;
      }
      break;
    }

    // Return original if no format matches
    return phone;
  }

  /**
   * Normalize a phone number to E.164 (+<country><number>), defaulting to US
   * (+1) for 10-digit input. Used to compare an entered phone against the
   * Firebase-verified phone (which is always E.164). Returns '' for empty
   * input and the cleaned best-effort form otherwise.
   * @param {string} phone
   * @param {string} defaultCountry - ISO-ish hint; only 'us' is special-cased
   * @returns {string}
   */
  static e164(phone, defaultCountry = 'us') {
    if (!phone) return '';
    const raw = String(phone).trim();
    // Keep a leading + if present; strip everything else non-digit.
    const hasPlus = raw.startsWith('+');
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (hasPlus) return `+${digits}`;
    if (defaultCountry === 'us') {
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    }
    return `+${digits}`;
  }

  /**
   * Format name (capitalize properly)
   * @param {string} name - Name to format
   * @param {boolean} lastFirst - Format as "Last, First"
   */
  static name(name, lastFirst = false) {
    if (!name) {
      return '';
    }

    const formatted = name
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase())
      .replace(/\bMc(\w)/g, (match, char) => `Mc${char.toUpperCase()}`)
      .replace(/\bMac(\w)/g, (match, char) => `Mac${char.toUpperCase()}`);

    if (lastFirst && formatted.includes(' ')) {
      const parts = formatted.split(' ');
      const last = parts.pop();
      return `${last}, ${parts.join(' ')}`;
    }

    return formatted;
  }

  /**
   * Format full name from first and last
   * @param {string} firstName - First name
   * @param {string} lastName - Last name
   * @param {boolean} lastFirst - Format as "Last, First"
   */
  static fullName(firstName, lastName, lastFirst = false) {
    const parts = [];

    if (firstName) parts.push(this.name(firstName));
    if (lastName) parts.push(this.name(lastName));

    if (parts.length === 0) {
      return '';
    }

    if (lastFirst && parts.length === 2) {
      return `${parts[1]}, ${parts[0]}`;
    }

    return parts.join(' ');
  }

  /**
   * Format percentage
   * @param {number} value - Value to format (0.15 for 15%)
   * @param {number} decimals - Number of decimal places
   */
  static percentage(value, decimals = 0) {
    if (value === null || value === undefined) {
      return '0%';
    }

    const percentage = value * 100;
    return `${percentage.toFixed(decimals)}%`;
  }

  /**
   * Format weight
   * @param {number} weight - Weight value
   * @param {string} unit - Weight unit (lbs, kg)
   */
  static weight(weight, unit = 'lbs') {
    if (weight === null || weight === undefined) {
      return `0 ${unit}`;
    }

    return `${Number(weight).toFixed(2)} ${unit}`;
  }

  /**
   * Format order ID for display
   * @param {string} orderId - Order ID
   * @param {boolean} short - Use short format
   */
  static orderId(orderId, short = false) {
    if (!orderId) {
      return '';
    }

    if (short && orderId.length > 10) {
      // Show first and last parts
      return `${orderId.slice(0, 6)}...${orderId.slice(-4)}`;
    }

    return orderId;
  }

  /**
   * Format bag ID for display
   * @param {string} bagId - Bag ID
   * @param {boolean} showBagNumber - Extract and show bag number only
   */
  static bagId(bagId, showBagNumber = false) {
    if (!bagId) {
      return '';
    }

    if (showBagNumber) {
      // Extract bag number from format: ORD-XXX-BAG1
      const match = bagId.match(/BAG(\d+)$/);
      if (match) {
        return `Bag #${match[1]}`;
      }
    }

    return bagId;
  }

  /**
   * Format status for display
   * @param {string} status - Status value
   * @param {string} type - Status type (order, payment, bag)
   */
  static status(status, type = 'order') {
    if (!status) {
      return '';
    }

    const statusMaps = {
      order: {
        pending: 'Pending',
        in_progress: 'In Progress',
        out_for_delivery: 'Out for Delivery',
        complete: 'Complete',
        cancelled: 'Cancelled'
      },
      payment: {
        pending: 'Pending',
        awaiting: 'Awaiting Payment',
        confirming: 'Confirming',
        verified: 'Verified',
        failed: 'Failed',
        refunded: 'Refunded',
        partial: 'Partial Payment',
        overpaid: 'Overpaid'
      },
      bag: {
        intake: 'Checked In',
        processed: 'Processed',
        picked_up: 'Picked Up',
        delivered: 'Delivered'
      }
    };

    const map = statusMaps[type] || statusMaps.order;
    return map[status] || status.charAt(0).toUpperCase() + status.slice(1);
  }

  /**
   * Format file size
   * @param {number} bytes - File size in bytes
   */
  static fileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration
   * @param {number} seconds - Duration in seconds
   */
  static duration(seconds) {
    if (!seconds || seconds < 0) {
      return '0s';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];

    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Format plural text
   * @param {number} count - Item count
   * @param {string} singular - Singular form
   * @param {string} plural - Plural form (optional)
   */
  static plural(count, singular, plural = null) {
    if (count === 1) {
      return `${count} ${singular}`;
    }

    if (plural) {
      return `${count} ${plural}`;
    }

    // Simple pluralization
    return `${count} ${singular}s`;
  }

  /**
   * Truncate text
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @param {string} suffix - Suffix to add (default: '...')
   */
  static truncate(text, maxLength = 50, suffix = '...') {
    if (!text) {
      return '';
    }

    if (text.length <= maxLength) {
      return text;
    }

    return text.substr(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Format list as string
   * @param {Array} items - Items to format
   * @param {string} separator - Separator for all but last
   * @param {string} lastSeparator - Separator for last item
   */
  static list(items, separator = ', ', lastSeparator = ' and ') {
    if (!items || items.length === 0) {
      return '';
    }

    if (items.length === 1) {
      return String(items[0]);
    }

    if (items.length === 2) {
      return items.join(lastSeparator);
    }

    const allButLast = items.slice(0, -1);
    const last = items[items.length - 1];

    return allButLast.join(separator) + lastSeparator + last;
  }
}

module.exports = Formatters;