/**
 * Simple mustache-style template renderer.
 * Replaces {{KEY}} placeholders with values from the context.
 */
export function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return context[key] ?? match;
  });
}
