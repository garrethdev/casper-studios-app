import type { Allergen, AnalyzeRequest } from '@leanplate/contracts';
import type { DietFlags } from './knowledge/types';

/**
 * Name-based guesses used only for foods that are not in the knowledge base.
 * They are deliberately cautious: when in doubt a food is assumed to contain
 * the allergen or the animal product, so the user gets a warning to double-check.
 */

const ALLERGEN_WORDS: Record<Allergen, RegExp> = {
  peanut: /\b(peanut|groundnut|satay)\b/i,
  'tree-nut': /\b(almond|walnut|cashew|pecan|pistachio|hazelnut|macadamia|brazil nut|pine nut|nutella|marzipan|praline)s?\b/i,
  dairy: /\b(milk|cheese|cheddar|mozzarella|parmesan|yogh?urt|butter|cream|creamy|ice cream|latte|cappuccino|whey|custard|paneer|ghee|alfredo|queso)\b/i,
  egg: /\b(eggs?|omelet+e?|frittata|mayo|mayonnaise|meringue|quiche|aioli|custard)\b/i,
  gluten: /\b(bread|toast|bagel|pasta|spaghetti|noodles?|ramen|wheat|flour|cracker|pizza|burger bun|bun|sandwich|wrap|tortilla|pancake|waffle|cake|cookie|biscuit|croissant|pastry|muffin|donut|doughnut|couscous|barley|rye|beer|cereal|pretzel|breaded|battered|lasagn?e|dumpling)s?\b/i,
  soy: /\b(soy|soya|tofu|tempeh|edamame|miso|teriyaki)\b/i,
  shellfish: /\b(shrimp|prawn|crab|lobster|crayfish|crawfish|scallop|clam|mussel|oyster|squid|calamari)s?\b/i,
  fish: /\b(fish|salmon|tuna|cod|tilapia|trout|sardine|anchov(y|ies)|mackerel|haddock|halibut|sushi|sashimi)\b/i,
  sesame: /\b(sesame|tahini|hummus|falafel)\b/i,
};

export function inferAllergens(name: string): Allergen[] {
  return (Object.keys(ALLERGEN_WORDS) as Allergen[]).filter((a) => ALLERGEN_WORDS[a].test(name));
}

const MEAT = /\b(chicken|beef|steak|pork|bacon|ham|sausage|salami|pepperoni|turkey|lamb|veal|duck|mince|meatball|burger|hamburger|hot dog|jerky|brisket|ribs?|wings?|nuggets?|gelatin|gummy|gummies|lard|prosciutto|chorizo|meat)s?\b/i;
const FISH = /\b(fish|salmon|tuna|cod|tilapia|trout|sardine|anchov(y|ies)|mackerel|haddock|halibut|sushi|sashimi|shrimp|prawn|crab|lobster|scallop|clam|mussel|oyster|squid|calamari|caviar)s?\b/i;
const DAIRY_OR_EGG = /\b(milk|cheese|cheddar|mozzarella|parmesan|yogh?urt|butter|cream|ice cream|latte|whey|egg|eggs|omelet+e?|frittata|mayo|mayonnaise|custard|quiche|paneer|ghee)\b/i;
const HONEY = /\bhoney\b/i;

export function inferDiet(name: string): DietFlags {
  if (MEAT.test(name)) return { vegan: false, vegetarian: false, pescatarian: false };
  if (FISH.test(name)) return { vegan: false, vegetarian: false, pescatarian: true };
  if (DAIRY_OR_EGG.test(name) || HONEY.test(name)) return { vegan: false, vegetarian: true, pescatarian: true };
  return { vegan: true, vegetarian: true, pescatarian: true };
}

/** The reason a food does not fit the chosen diet, or null when it fits (or the diet is "none"). */
type Diet = AnalyzeRequest['diet'];

export function dietConflict(diet: Diet, flags: DietFlags): string | null {
  if (diet === 'vegan' && !flags.vegan) return 'vegan';
  if (diet === 'vegetarian' && !flags.vegetarian) return 'vegetarian';
  if (diet === 'pescatarian' && !flags.pescatarian) return 'pescatarian';
  return null;
}
