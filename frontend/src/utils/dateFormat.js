/**
 * Utility functions for date and time formatting
 * Centralized location for all date/time formatting logic
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
 * Format datetime to DD.MM.YYYY HH:MM
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted datetime or '—' if invalid
 */
export const formatDateTime = (dateInput) => {
    if (!dateInput) return '—';
    const date = formatDate(dateInput);
    const time = formatTime(dateInput);
    if (date === '—' || !time) return '—';
    return `${date} ${time}`;
};

/**
 * Format datetime to DD.MM.YYYY HH:MM:SS
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted datetime with seconds or '—' if invalid
 */
export const formatDateTimeWithSeconds = (dateInput) => {
    if (!dateInput) return '—';
    const date = formatDate(dateInput);
    const time = formatTimeWithSeconds(dateInput);
    if (date === '—' || !time) return '—';
    return `${date} ${time}`;
};

/**
 * Format Date object to YYYY-MM-DD (for API calls and date inputs)
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
 * Parse date string from URL format (YYYY-MM-DD) to Date object
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} Date object or null if invalid
 */
export const parseDateFromUrl = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};
