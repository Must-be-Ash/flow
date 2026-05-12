/**
 * Plugin Registry — Stub
 *
 * The static plugin model has been replaced by runtime service
 * discovery via AgentCash. This file provides no-op exports so
 * any code that still references @/plugins continues to compile
 * during the transition.
 */

export type SelectOption = {
  value: string;
  label: string;
};

export type ActionConfigFieldBase = {
  key: string;
  label: string;
  type: "template-input" | "template-textarea" | "text" | "number" | "select" | "schema-builder";
  placeholder?: string;
  defaultValue?: string;
  example?: string;
  options?: SelectOption[];
  rows?: number;
  min?: number;
  max?: number;
  required?: boolean;
  showWhen?: { field: string; equals: string };
};

export type ActionConfigFieldGroup = {
  groupLabel: string;
  label?: string;
  defaultExpanded?: boolean;
  fields: ActionConfigFieldBase[];
};

export type ActionConfigField = ActionConfigFieldBase | ActionConfigFieldGroup;

export type PluginAction = {
  id: string;
  label: string;
  description: string;
  icon?: string;
  integration?: string;
  category?: string;
  configFields: ActionConfigField[];
  stepFunction?: string;
  codegenTemplate?: string;
  stepImportPath?: string;
};

export type IntegrationPlugin = {
  type: string;
  label: string;
  description: string;
  icon?: string;
  actions: PluginAction[];
};

// No-op registry functions
export function registerIntegration(_plugin: IntegrationPlugin): void {}
export function getAllIntegrations(): IntegrationPlugin[] { return []; }
export function getIntegration(_type: string): IntegrationPlugin | undefined { return undefined; }
export function findActionById(_actionId: string): PluginAction | undefined { return undefined; }
export function getAllActions(): PluginAction[] { return []; }
export function getIntegrationLabels(): Record<string, string> { return {}; }
export function flattenConfigFields(fields: ActionConfigField[]): ActionConfigFieldBase[] {
  const result: ActionConfigFieldBase[] = [];
  for (const field of fields) {
    if ("groupLabel" in field) {
      result.push(...field.fields);
    } else {
      result.push(field);
    }
  }
  return result;
}
export function generateAIActionPrompts(): string { return ""; }
export function getAllEnvVars(): Record<string, string> { return {}; }
export function getDependenciesForActions(_actionTypes: string[]): string[] { return []; }
export function getCredentialMapping(_type: string, _config: Record<string, unknown>): Record<string, string> { return {}; }
export function getActionsByCategory(): Record<string, PluginAction[]> { return {}; }
export function isFieldGroup(field: ActionConfigField): field is ActionConfigFieldGroup {
  return "groupLabel" in field;
}
