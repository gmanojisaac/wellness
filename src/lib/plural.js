// plural(1, 'class', 'classes') → '1 class'; plural(3, 'week') → '3 weeks'
export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
