"use client";

/**
 * NodeSpec-driven config panel
 *
 * Reads a NodeSpec's inputSchema (JSON Schema) and renders
 * appropriate form fields using the existing template badge components.
 */

import { TemplateBadgeInput } from "@/components/ui/template-badge-input";
import { TemplateBadgeTextarea } from "@/components/ui/template-badge-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type JSONSchema = Record<string, unknown>;

type NodeSpecConfigProps = {
  inputSchema: JSONSchema;
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: unknown) => void;
  nodeId: string;
  upstreamNodes?: Array<{ id: string; label: string }>;
};

type FieldDef = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "textarea";
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: unknown;
};

/**
 * Convert JSON Schema properties to field definitions.
 */
function schemaToFields(schema: JSONSchema): FieldDef[] {
  const properties = (schema.properties || {}) as Record<string, JSONSchema>;
  const required = ((schema.required || []) as string[]);
  const fields: FieldDef[] = [];

  for (const [key, prop] of Object.entries(properties)) {
    const propType = prop.type as string;
    const enumValues = prop.enum as string[] | undefined;

    let fieldType: FieldDef["type"] = "string";
    if (enumValues) {
      fieldType = "select";
    } else if (propType === "number" || propType === "integer") {
      fieldType = "number";
    } else if (propType === "boolean") {
      fieldType = "boolean";
    } else if (
      (prop.maxLength && (prop.maxLength as number) > 200) ||
      key.toLowerCase().includes("body") ||
      key.toLowerCase().includes("content") ||
      key.toLowerCase().includes("prompt") ||
      key.toLowerCase().includes("text") ||
      key.toLowerCase().includes("query") ||
      key.toLowerCase().includes("message")
    ) {
      fieldType = "textarea";
    }

    fields.push({
      key,
      label: (prop.title as string) || key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()),
      type: fieldType,
      description: prop.description as string | undefined,
      required: required.includes(key),
      placeholder: (Array.isArray(prop.examples) ? String(prop.examples[0]) : undefined) || (prop.default != null ? String(prop.default) : undefined),
      options: enumValues?.map((v) => ({ value: v, label: v })),
      defaultValue: prop.default,
    });
  }

  return fields;
}

export function NodeSpecConfig({
  inputSchema,
  config,
  onUpdateConfig,
  nodeId,
  upstreamNodes,
}: NodeSpecConfigProps) {
  const fields = schemaToFields(inputSchema);

  if (fields.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        This endpoint has no configurable parameters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label className="text-xs">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>

          {field.type === "textarea" ? (
            <TemplateBadgeTextarea
              nodeId={nodeId}
              onChange={(value) => onUpdateConfig(field.key, value)}
              placeholder={field.placeholder || ""}
              rows={3}
              value={String(config[field.key] ?? field.defaultValue ?? "")}
            />
          ) : field.type === "select" && field.options ? (
            <Select
              onValueChange={(value) => onUpdateConfig(field.key, value)}
              value={String(config[field.key] ?? field.defaultValue ?? "")}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={`Select ${field.label}...`} />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field.type === "number" ? (
            <Input
              className="h-8 text-xs"
              onChange={(e) => onUpdateConfig(field.key, Number(e.target.value))}
              placeholder={field.placeholder || ""}
              type="number"
              value={String(config[field.key] ?? field.defaultValue ?? "")}
            />
          ) : (
            <TemplateBadgeInput
              nodeId={nodeId}
              onChange={(value) => onUpdateConfig(field.key, value)}
              placeholder={field.placeholder || ""}
              value={String(config[field.key] ?? field.defaultValue ?? "")}
            />
          )}

          {field.description && (
            <p className="text-[10px] text-muted-foreground">
              {field.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
