import { Type } from '@google/genai';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Function declaration for Gemini
export const webSearchFunctionDeclaration = {
  name: 'search_web',
  description: 'Searches the web using DuckDuckGo for information and returns relevant results.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query to look for on the web',
      },
      max_results: {
        type: Type.NUMBER,
        description: 'Maximum number of search results to return (default: 5, max: 10)',
      },
    },
    required: ['query'],
  },
};

/**
 * Search the web using DuckDuckGo
 * @param {string} query - The search query
 * @param {number} max_results - Maximum number of results to return
 * @return {Object} Search results
 */
export async function searchWeb({ query, max_results = 5 }) {
  try {
    // Limit max_results to prevent abuse
    const limit = Math.min(max_results || 5, 10);
    
    // DuckDuckGo Instant Answer API (limited but free)
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await axios.get(ddgUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Jotium-Agent/1.0 (Educational Purpose)'
      }
    });

    const data = response.data;
    const results = [];

    // Add instant answer if available
    if (data.Abstract && data.Abstract.trim()) {
      results.push({
        title: data.Heading || 'Instant Answer',
        snippet: data.Abstract,
        url: data.AbstractURL || '',
        source: data.AbstractSource || 'DuckDuckGo',
        type: 'instant_answer'
      });
    }

    // Add definition if available
    if (data.Definition && data.Definition.trim()) {
      results.push({
        title: `Definition: ${query}`,
        snippet: data.Definition,
        url: data.DefinitionURL || '',
        source: data.DefinitionSource || 'Dictionary',
        type: 'definition'
      });
    }

    // Add related results
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const relatedResults = data.RelatedTopics
        .filter(topic => topic.Text && topic.FirstURL)
        .slice(0, limit - results.length)
        .map(topic => ({
          title: topic.Text.split(' - ')[0] || 'Related Topic',
          snippet: topic.Text,
          url: topic.FirstURL,
          source: 'DuckDuckGo',
          type: 'related'
        }));
      
      results.push(...relatedResults);
    }

    // If no results from instant answers, try web scraping approach
    if (results.length === 0) {
      try {
        // Alternative: Use DuckDuckGo HTML search (more complex but might yield results)
        const htmlSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const htmlResponse = await axios.get(htmlSearchUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const $ = cheerio.load(htmlResponse.data);
        const searchResults = $('.result__body').slice(0, limit);

        searchResults.each((index, element) => {
          const title = $(element).find('.result__title a').text().trim();
          const snippet = $(element).find('.result__snippet').text().trim();
          const url = $(element).find('.result__title a').attr('href');

          if (title && snippet) {
            results.push({
              title,
              snippet,
              url: url || '',
              source: 'DuckDuckGo Search',
              type: 'web_result'
            });
          }
        });
      } catch (htmlError) {
        console.error('HTML search fallback failed:', htmlError.message);
      }
    }

    // If still no results, return a helpful message
    if (results.length === 0) {
      return {
        query,
        results: [{
          title: 'No Results Found',
          snippet: `No web results found for "${query}". The search service might be temporarily unavailable or the query might be too specific.`,
          url: '',
          source: 'Jotium',
          type: 'system_message'
        }],
        total_results: 0,
        search_time: new Date().toISOString()
      };
    }

    return {
      query,
      results: results.slice(0, limit),
      total_results: results.length,
      search_time: new Date().toISOString()
    };

  } catch (error) {
    console.error('Web search error:', error.message);
    
    return {
      query,
      results: [{
        title: 'Search Error',
        snippet: `Failed to search the web: ${error.message}. Please try again with a different query.`,
        url: '',
        source: 'Jotium',
        type: 'error'
      }],
      total_results: 0,
      search_time: new Date().toISOString(),
      error: error.message
    };
  }
}