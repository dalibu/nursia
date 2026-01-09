/**
 * Utility functions for date and time formatting
 * Now uses UTC methods to ensure consistency regardless of local timezone
 */

/**
 * Format date to DD.MM.YYYY (UTC)
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted date or '—' if invalid
 */
export const formatDate = (dateInput) => {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
};

/**
 * Format date to YYYY-MM-DD (Local)
 * Used for input[type="date"] values and API params that expect local dates
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
export const toLocalDateString = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Format time to HH:MM (UTC)
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted time or empty string if invalid
 */
export const formatTime = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

/**
 * Format time to HH:MM:SS (UTC)
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted time with seconds or empty string if invalid
 */
export const formatTimeWithSeconds = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

/**
 * Format timestamp to DD.MM.YYYY HH:MM (UTC)
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted string
 */
export const formatDateTime = (dateInput) => {
    if (!dateInput) return '—';
    return `${formatDate(dateInput)} ${formatTime(dateInput)}`;
};

/**
 * Format timestamp to DD.MM.YYYY HH:MM:SS (UTC)
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted string
 */
export const formatDateTimeWithSeconds = (dateInput) => {
    if (!dateInput) return '—';
    return `${formatDate(dateInput)} ${formatTimeWithSeconds(dateInput)}`;
};

/**
 * Parse date from URL string (YYYY-MM-DD)
 * @param {string} dateStr - Date string from URL
 * @returns {Date|null} Date object or null
 */
export const parseDateFromUrl = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

/**
 * Calculate difference in days between two dates (inclusive)
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {number} Number of days
 */
export const getDaysDifference = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Reset time part to ensure only date difference is calculated
    // using UTC to avoid DST issues
    const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

    const diffTime = Math.abs(utcEnd - utcStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays + 1; // Inclusive of start day
};

/**
 * Format hours with smart decimal/comma handling and suffix
 * 2 -> "2 ч."
 * 1.5 -> "1,5 ч." (no trailing zero)
 * 2.75 -> "2,75 ч."
 * @param {number|string} hours - Hours value
 * @returns {string} Formatted string
 */
export const formatDurationHours = (hours) => {
    if (hours === undefined || hours === null) return '';
    const val = Number(hours);
    if (isNaN(val)) return '';

    // parseFloat(toFixed(2)) removes trailing zeros: 1.50 -> 1.5, 2.00 -> 2
    const formatted = parseFloat(val.toFixed(2)).toString().replace('.', ',');
    return `${formatted} ч.`;
};

/**
 * Format hours to decimal string with localized separator and unit suffix
 * e.g. 1.5 -> "1,50 ч." or 8 -> "8 ч."
 * @param {number} hours - Number of hours
 * @returns {string} Formatted string
 */
export const formatHours = (hours) => {
    if (hours === undefined || hours === null) return '';
    const val = Number(hours);
    if (isNaN(val)) return '';

    // If integer, show as integer. If float, show 2 decimal places.
    // Or force 2 decimals? User showed "1,50" and "1,00" in request example "01:00 (1,00 ч.)", so let's force 2 decimals for consistency if it's not a round multi-day count.
    // Actually user example: "9 дн. (72 ч.)" -> integer. "01:30 (1,50)" -> 2 decimals.
    // Let's use this logic: if exactly integer, show integer. If float, show 2 decimals.
    // Wait, user example "01:00 (1,00)" implies ALWAYS 2 decimals used in LiveTimer context.
    // But "72 ч." implies integer.

    // Let's make it flexible or smart.
    // For Multi-day total hours (usually large integers), we might want integer.
    // For daily timer (01:30), we want precision.

    // Let's stick to the user's specific request "01:00 (1,00 ч.)" for the timer.
    // And "72 ч." for the total.

    // Let's try: always 2 decimals unless the number is > 24 (likely total days)? No, inconsistent.

    // Let's provide two functions or options?
    // User asked "01:00 (1,00 ч.)". So for timer, we need 2 decimals.

    // Let's update formatHours to take an option?
    // formatHours(hours, { decimals: 2 })

    const formatted = val.toFixed(2).replace('.', ',');
    return `${formatted} ч.`;
};

/**
 * Smart format hours: integer if integer, 2 decimals if float
 * Used for multi-day totals where "72,00 ч." looks weird
 */
export const formatHoursSmart = (hours) => {
    if (hours === undefined || hours === null) return '';
    const val = Number(hours);
    if (isNaN(val)) return '';

    const formatted = (Number.isInteger(val) ? val.toString() : val.toFixed(2)).replace('.', ',');
    return `${formatted} ч.`;
};
