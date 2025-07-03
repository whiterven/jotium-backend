// tools/index.js
// Import tool functions and declarations
import { 
    dateTimeFunctionDeclaration, 
    getCurrentDateTime 
  } from './dateTime.js';
  
  import { 
    webSearchFunctionDeclaration, 
    searchWeb 
  } from './webSearch.js';

import {
    clickUpFunctionDeclarations,
    getClickUpWorkspaces,
    getClickUpSpaces,
    getClickUpLists,
} from './clickUp.js';
  
  import {
    slackFunctionDeclarations,
    slackPostMessage,
  } from './slack.js';
  
  // Export all tool functions
  export const toolFunctions = {
    get_current_datetime: getCurrentDateTime,
    search_web: searchWeb,
    get_clickup_workspaces: getClickUpWorkspaces,
    get_clickup_spaces: getClickUpSpaces,
    get_clickup_lists: getClickUpLists,
    send_slack_message: slackPostMessage,
  };
  
  // Export all function declarations for Gemini
  export const functionDeclarations = [
    dateTimeFunctionDeclaration,
    webSearchFunctionDeclaration,
    ...clickUpFunctionDeclarations,
    ...slackFunctionDeclarations,
  ];
  
  // Export tools configuration for Gemini
  export const tools = [
    {
      functionDeclarations: functionDeclarations
    }
  ];
  
  // Helper function to get available tools info
  export function getAvailableTools() {
    return functionDeclarations.map(func => ({
      name: func.name,
      description: func.description,
      parameters: Object.keys(func.parameters.properties || {})
    }));
  }