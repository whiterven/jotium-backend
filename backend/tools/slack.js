import { Type } from '@google/genai';

// ... (full content as in your backend/tools/slack.js)

// Export all function declarations
export const slackFunctionDeclarations = [
  slackPostMessageFunctionDeclaration,
  slackListChannelsFunctionDeclaration,
  slackGetChannelHistoryFunctionDeclaration,
  slackListUsersFunctionDeclaration,
  slackGetUserInfoFunctionDeclaration,
  slackUpdateMessageFunctionDeclaration,
  slackDeleteMessageFunctionDeclaration,
  slackAddReactionFunctionDeclaration,
  slackUploadFileFunctionDeclaration,
  slackSetChannelTopicFunctionDeclaration,
];

// Export all tool functions
export const slackToolFunctions = {
  slack_post_message: slackPostMessage,
  slack_list_channels: slackListChannels,
  slack_get_channel_history: slackGetChannelHistory,
  slack_list_users: slackListUsers,
  slack_get_user_info: slackGetUserInfo,
  slack_update_message: slackUpdateMessage,
  slack_delete_message: slackDeleteMessage,
  slack_add_reaction: slackAddReaction,
  slack_upload_file: slackUploadFile,
  slack_set_channel_topic: slackSetChannelTopic,
};

// Helper function to get available Slack tools info
export function getAvailableSlackTools() {
  return slackFunctionDeclarations.map(func => ({
    name: func.name,
    description: func.description,
    parameters: Object.keys(func.parameters.properties || {}),
    required: func.parameters.required || []
  }));
}
