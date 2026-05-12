/**
 * Plugin index — re-exports from registry stub.
 * The static plugin system has been replaced by AgentCash service discovery.
 */
export {
  registerIntegration,
  getAllIntegrations,
  getIntegration,
  findActionById,
  getAllActions,
  getActionsByCategory,
  getIntegrationLabels,
  flattenConfigFields,
  generateAIActionPrompts,
  getAllEnvVars,
  getDependenciesForActions,
  getCredentialMapping,
  isFieldGroup,
} from "./registry";

export type {
  SelectOption,
  ActionConfigFieldBase,
  ActionConfigFieldGroup,
  ActionConfigField,
  PluginAction,
  IntegrationPlugin,
} from "./registry";
