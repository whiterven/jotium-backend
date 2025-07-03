import { Type } from '@google/genai';

// Function declaration for Gemini
export const dateTimeFunctionDeclaration = {
  name: 'get_current_datetime',
  description: 'Gets the current date and time information. Can provide date, time, timezone, or formatted datetime.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      format: {
        type: Type.STRING,
        enum: ['full', 'date', 'time', 'iso', 'timestamp'],
        description: 'Format of datetime to return: full (human readable), date (date only), time (time only), iso (ISO format), timestamp (unix timestamp)',
      },
      timezone: {
        type: Type.STRING,
        description: 'Timezone to use (optional). Examples: UTC, America/New_York, Europe/London, Asia/Tokyo',
      },
    },
    required: ['format'],
  },
};

/**
 * Get current date and time information
 * @param {string} format - Format of datetime to return
 * @param {string} timezone - Timezone to use (optional)
 * @return {Object} DateTime information
 */
export function getCurrentDateTime({ format, timezone = 'UTC' }) {
  try {
    const now = new Date();
    
    const options = timezone !== 'UTC' ? { timeZone: timezone } : {};
    
    switch (format) {
      case 'full':
        return {
          datetime: now.toLocaleString('en-US', {
            ...options,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          }),
          timezone: timezone
        };
      
      case 'date':
        return {
          date: now.toLocaleDateString('en-US', {
            ...options,
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          timezone: timezone
        };
      
      case 'time':
        return {
          time: now.toLocaleTimeString('en-US', {
            ...options,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          timezone: timezone
        };
      
      case 'iso':
        return {
          datetime: timezone !== 'UTC' 
            ? new Date(now.toLocaleString('en-US', options)).toISOString()
            : now.toISOString(),
          timezone: timezone
        };
      
      case 'timestamp':
        return {
          timestamp: Math.floor(now.getTime() / 1000),
          milliseconds: now.getTime(),
          timezone: timezone
        };
      
      default:
        return {
          datetime: now.toISOString(),
          timezone: 'UTC'
        };
    }
  } catch (error) {
    return {
      error: `Failed to get datetime: ${error.message}`,
      timezone: timezone
    };
  }
}