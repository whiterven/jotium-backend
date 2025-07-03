import { Type } from '@google/genai';

// ClickUp API base configuration
const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

// Function declarations for Gemini
export const clickUpFunctionDeclarations = [
  // ... (full content as in your backend/tools/clickUp.js)
];

// ... (all function implementations as in your backend/tools/clickUp.js)

// Export all tool functions
export const clickUpToolFunctions = {
  get_clickup_workspaces: getClickUpWorkspaces,
  get_clickup_spaces: getClickUpSpaces,
  get_clickup_folders: getClickUpFolders,
  get_clickup_lists: getClickUpLists,
  get_clickup_tasks: getClickUpTasks,
  get_clickup_task: getClickUpTask,
  create_clickup_task: createClickUpTask,
  update_clickup_task: updateClickUpTask,
  delete_clickup_task: deleteClickUpTask,
  get_clickup_task_comments: getClickUpTaskComments,
  create_clickup_task_comment: createClickUpTaskComment,
  get_clickup_time_entries: getClickUpTimeEntries,
  create_clickup_time_entry: createClickUpTimeEntry,
  get_clickup_team_members: getClickUpTeamMembers,
  get_clickup_user: getClickUpUser,
  search_clickup_tasks: searchClickUpTasks,
};

// Helper function to get available ClickUp tools info
export function getAvailableClickUpTools() {
  return clickUpFunctionDeclarations.map(func => ({
    name: func.name,
    description: func.description,
    parameters: Object.keys(func.parameters.properties || {})
  }));
}
