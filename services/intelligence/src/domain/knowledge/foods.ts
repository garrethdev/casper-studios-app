import type { Allergen } from '@leanplate/contracts';
import type { DietFlags, Food, FoodCategory, PortionUnit } from './types';

/**
 * Reference foods. Every figure is an APPROXIMATE reference value per 100 g,
 * rounded from common public nutrition tables. Real products vary with brand,
 * recipe and cooking method, so these are estimates to guide a meal log, not
 * lab measurements.
 */
export const KNOWLEDGE_BASE_LABEL = 'Approximate reference values per 100 g';

type DietCode = 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore';

const DIET: Record<DietCode, DietFlags> = {
  vegan: { vegan: true, vegetarian: true, pescatarian: true },
  vegetarian: { vegan: false, vegetarian: true, pescatarian: true },
  pescatarian: { vegan: false, vegetarian: false, pescatarian: true },
  omnivore: { vegan: false, vegetarian: false, pescatarian: false },
};

type Nutrition = [kcal: number, proteinG: number, carbsG: number, fatG: number, fiberG: number, sugarG: number];

interface Extra {
  unitG?: number;
  units?: Partial<Record<PortionUnit, number>>;
  alcohol?: boolean;
}

function food(
  id: string,
  name: string,
  aliases: string[],
  category: FoodCategory,
  n: Nutrition,
  typicalPortionG: number,
  portionLabel: string,
  allergens: Allergen[],
  diet: DietCode,
  extra: Extra = {},
): Food {
  const [kcal, proteinG, carbsG, fatG, fiberG, sugarG] = n;
  return {
    id,
    name,
    aliases,
    category,
    per100g: { kcal, proteinG, carbsG, fatG, fiberG, sugarG },
    typicalPortionG,
    portionLabel,
    allergens,
    diet: DIET[diet],
    ...extra,
  };
}

export const FOODS: readonly Food[] = [
  /* ---------------- breakfast ---------------- */
  food('rolled-oats', 'Rolled oats, dry', ['oats', 'rolled oats', 'old fashioned oats', 'dry oats', 'porridge oats'], 'breakfast', [379, 13.2, 67.7, 6.5, 10.1, 1.1], 40, '1/2 cup dry', ['gluten'], 'vegan', { units: { cup: 80 } }),
  food('oatmeal-cooked', 'Oatmeal, cooked', ['oatmeal', 'porridge', 'cooked oatmeal'], 'breakfast', [71, 2.5, 12, 1.5, 1.7, 0.3], 234, '1 cup cooked', ['gluten'], 'vegan', { units: { cup: 234, bowl: 250 } }),
  food('scrambled-eggs', 'Scrambled eggs', ['scrambled eggs', 'scrambled egg', 'egg scramble'], 'breakfast', [149, 10, 1.6, 11, 0, 1.4], 122, '2 large eggs, scrambled', ['egg', 'dairy'], 'vegetarian', { unitG: 61 }),
  food('boiled-egg', 'Egg, hard-boiled', ['egg', 'eggs', 'boiled egg', 'hard boiled egg', 'soft boiled egg', 'whole egg'], 'breakfast', [155, 12.6, 1.1, 10.6, 0, 1.1], 50, '1 large egg', ['egg'], 'vegetarian', { unitG: 50 }),
  food('fried-egg', 'Egg, fried', ['fried egg', 'sunny side up egg', 'over easy egg', 'fried eggs'], 'breakfast', [196, 13.6, 0.8, 14.8, 0, 0.4], 46, '1 large egg, fried', ['egg'], 'vegetarian', { unitG: 46 }),
  food('egg-white', 'Egg whites', ['egg white', 'egg whites'], 'breakfast', [52, 10.9, 0.7, 0.2, 0, 0.7], 100, '3 egg whites', ['egg'], 'vegetarian', { unitG: 33 }),
  food('omelet', 'Omelet, cheese', ['omelet', 'omelette', 'cheese omelet', 'cheese omelette', 'veggie omelet'], 'breakfast', [154, 10.6, 0.6, 12, 0.1, 0.5], 120, '1 two-egg omelet', ['egg', 'dairy'], 'vegetarian'),
  food('whole-wheat-bread', 'Whole wheat bread', ['whole wheat bread', 'whole wheat toast', 'whole grain bread', 'whole grain toast', 'wholemeal bread', 'wholemeal toast', 'brown bread', 'brown toast'], 'breakfast', [252, 12.5, 42.7, 3.5, 6, 5.7], 32, '1 slice', ['gluten'], 'vegan', { units: { slice: 32 } }),
  food('white-bread', 'White bread', ['white bread', 'white toast', 'toast', 'bread', 'sandwich bread', 'sliced bread'], 'breakfast', [265, 9, 49, 3.2, 2.7, 5], 30, '1 slice', ['gluten'], 'vegan', { units: { slice: 30 } }),
  food('bagel', 'Bagel, plain', ['bagel', 'plain bagel'], 'breakfast', [257, 10, 50, 1.6, 2.2, 5.4], 105, '1 medium bagel', ['gluten'], 'vegan'),
  food('english-muffin', 'English muffin', ['english muffin'], 'breakfast', [227, 8.7, 44.5, 1.8, 2.7, 3], 57, '1 muffin', ['gluten'], 'vegan'),
  food('croissant', 'Croissant', ['croissant', 'butter croissant'], 'breakfast', [406, 8.2, 45.8, 21, 2.6, 11.3], 57, '1 medium croissant', ['gluten', 'dairy', 'egg'], 'vegetarian'),
  food('pancakes', 'Pancakes', ['pancake', 'pancakes', 'hotcakes', 'flapjacks'], 'breakfast', [227, 6.4, 28, 10, 1.5, 5], 114, '3 small pancakes', ['gluten', 'egg', 'dairy'], 'vegetarian', { unitG: 38 }),
  food('waffle', 'Waffle', ['waffle', 'waffles'], 'breakfast', [291, 7.9, 33, 14.1, 1.9, 8], 75, '1 waffle', ['gluten', 'egg', 'dairy'], 'vegetarian', { unitG: 75 }),
  food('corn-flakes', 'Corn flakes cereal', ['corn flakes', 'cornflakes', 'cereal', 'breakfast cereal'], 'breakfast', [357, 7.5, 84, 0.4, 3.3, 10], 30, '1 cup (30 g)', ['gluten'], 'vegan', { units: { cup: 30, bowl: 45 } }),
  food('granola', 'Granola', ['granola', 'muesli', 'granola cereal'], 'breakfast', [471, 10, 64, 20, 7, 24], 50, '1/2 cup', ['gluten', 'tree-nut'], 'vegetarian', { units: { cup: 100 } }),
  food('bacon', 'Bacon, cooked', ['bacon', 'bacon strips', 'bacon slices', 'crispy bacon'], 'breakfast', [541, 37, 1.4, 42, 0, 0], 24, '3 slices', [], 'omnivore', { unitG: 8 }),
  food('breakfast-sausage', 'Breakfast sausage', ['sausage', 'breakfast sausage', 'sausage links', 'pork sausage'], 'breakfast', [339, 19, 1, 28, 0, 0.5], 50, '2 links', [], 'omnivore', { unitG: 25 }),
  food('hash-browns', 'Hash browns', ['hash brown', 'hash browns', 'hashbrown'], 'breakfast', [265, 2.6, 28, 16, 2.7, 0.5], 100, '1 patty or small serving', [], 'vegan'),
  food('breakfast-sandwich', 'Breakfast sandwich (egg, cheese, sausage)', ['breakfast sandwich', 'egg mcmuffin', 'egg and cheese sandwich', 'sausage egg and cheese'], 'breakfast', [250, 11, 22, 13, 1, 3], 140, '1 sandwich', ['gluten', 'egg', 'dairy'], 'omnivore'),
  food('maple-syrup', 'Maple syrup', ['maple syrup', 'pancake syrup', 'syrup'], 'breakfast', [260, 0, 67, 0.1, 0, 60], 40, '2 tbsp', [], 'vegan', { units: { tbsp: 20 } }),

  /* ---------------- proteins ---------------- */
  food('chicken-breast', 'Chicken breast, grilled', ['chicken breast', 'grilled chicken', 'grilled chicken breast', 'baked chicken breast', 'roasted chicken breast', 'chicken', 'skinless chicken breast', 'chicken fillet'], 'protein', [165, 31, 0, 3.6, 0, 0], 120, '4 oz (palm-sized) cooked', [], 'omnivore', { unitG: 172 }),
  food('chicken-thigh', 'Chicken thigh, roasted', ['chicken thigh', 'chicken thighs', 'roasted chicken thigh', 'dark meat chicken', 'chicken drumstick'], 'protein', [209, 26, 0, 10.9, 0, 0], 100, '1 thigh, skinless', [], 'omnivore', { unitG: 100 }),
  food('fried-chicken', 'Fried chicken', ['fried chicken', 'crispy chicken', 'southern fried chicken', 'chicken tenders'], 'protein', [246, 19, 9, 15, 0.4, 0.2], 130, '1 large piece', ['gluten', 'egg'], 'omnivore', { unitG: 100 }),
  food('chicken-wings', 'Chicken wings', ['chicken wing', 'chicken wings', 'buffalo wings', 'hot wings'], 'protein', [290, 27, 0, 19.5, 0, 0], 90, '3 wings', [], 'omnivore', { unitG: 30 }),
  food('turkey-breast', 'Turkey breast, roasted', ['turkey', 'turkey breast', 'sliced turkey', 'deli turkey', 'roast turkey'], 'protein', [135, 30, 0, 1, 0, 0], 85, '3 oz', [], 'omnivore', { units: { slice: 28 } }),
  food('ground-beef-lean', 'Ground beef, lean, cooked', ['ground beef', 'lean ground beef', 'beef mince', 'minced beef', 'hamburger meat', 'beef patty'], 'protein', [217, 26, 0, 12, 0, 0], 113, '4 oz cooked', [], 'omnivore'),
  food('steak', 'Steak, sirloin, grilled', ['steak', 'sirloin steak', 'grilled steak', 'beef steak', 'ribeye steak', 'beef'], 'protein', [206, 29, 0, 9.5, 0, 0], 140, '5 oz cooked', [], 'omnivore'),
  food('pork-chop', 'Pork chop, cooked', ['pork chop', 'pork chops', 'pork loin', 'grilled pork', 'pork'], 'protein', [231, 26, 0, 14, 0, 0], 120, '1 chop, boneless', [], 'omnivore'),
  food('ham', 'Ham, sliced', ['ham', 'deli ham', 'sliced ham', 'ham slices'], 'protein', [145, 21, 1.5, 5.5, 0, 1], 56, '2 slices', [], 'omnivore', { unitG: 28, units: { slice: 28 } }),
  food('beef-jerky', 'Beef jerky', ['jerky', 'beef jerky'], 'snacks', [410, 33, 11, 26, 1.8, 9], 28, '1 oz', ['soy'], 'omnivore'),
  food('salmon', 'Salmon, baked', ['salmon', 'baked salmon', 'grilled salmon', 'salmon fillet', 'salmon filet'], 'protein', [206, 22, 0, 12, 0, 0], 140, '1 fillet, cooked', ['fish'], 'pescatarian'),
  food('tuna-canned', 'Tuna, canned in water', ['tuna', 'canned tuna', 'tuna in water', 'tinned tuna'], 'protein', [116, 26, 0, 0.8, 0, 0], 110, '1 can, drained', ['fish'], 'pescatarian', { units: { can: 112 } }),
  food('white-fish', 'White fish (cod, tilapia), baked', ['white fish', 'cod', 'tilapia', 'haddock', 'fish fillet', 'baked fish', 'grilled fish', 'fish'], 'protein', [120, 24, 0, 2.5, 0, 0], 140, '1 fillet, cooked', ['fish'], 'pescatarian'),
  food('sardines', 'Sardines, canned', ['sardines', 'sardine', 'canned sardines'], 'protein', [208, 25, 0, 11.5, 0, 0], 92, '1 can, drained', ['fish'], 'pescatarian', { units: { can: 92 } }),
  food('shrimp', 'Shrimp, cooked', ['shrimp', 'prawns', 'prawn', 'grilled shrimp', 'cooked shrimp'], 'protein', [99, 24, 0.2, 0.3, 0, 0], 85, '3 oz', ['shellfish'], 'pescatarian'),
  food('tofu', 'Tofu, firm', ['tofu', 'firm tofu', 'bean curd', 'baked tofu'], 'protein', [144, 17.3, 2.8, 8.7, 2.3, 0.6], 120, '1/2 cup', ['soy'], 'vegan'),
  food('tempeh', 'Tempeh', ['tempeh'], 'protein', [192, 20.3, 7.6, 10.8, 0, 0], 85, '3 oz', ['soy'], 'vegan'),
  food('whey-protein', 'Whey protein powder', ['protein powder', 'whey protein', 'whey', 'protein scoop'], 'protein', [400, 80, 8, 6, 0, 4], 30, '1 scoop', ['dairy'], 'vegetarian', { units: { scoop: 30 } }),
  food('protein-shake', 'Protein shake, ready to drink', ['protein shake', 'protein drink', 'shake'], 'drinks', [55, 9, 3, 1.5, 0.3, 2], 330, '1 bottle', ['dairy'], 'vegetarian', { units: { glass: 330 } }),

  /* ---------------- grains and starches ---------------- */
  food('white-rice', 'White rice, cooked', ['rice', 'white rice', 'steamed rice', 'cooked rice', 'jasmine rice', 'basmati rice', 'long grain rice'], 'grain', [130, 2.7, 28, 0.3, 0.4, 0.1], 158, '1 cup cooked', [], 'vegan', { units: { cup: 158, bowl: 250 } }),
  food('brown-rice', 'Brown rice, cooked', ['brown rice', 'wholegrain rice', 'whole grain rice'], 'grain', [123, 2.7, 25.6, 1, 1.6, 0.2], 195, '1 cup cooked', [], 'vegan', { units: { cup: 195, bowl: 250 } }),
  food('quinoa', 'Quinoa, cooked', ['quinoa', 'cooked quinoa'], 'grain', [120, 4.4, 21.3, 1.9, 2.8, 0.9], 185, '1 cup cooked', [], 'vegan', { units: { cup: 185 } }),
  food('pasta', 'Pasta, cooked', ['pasta', 'spaghetti', 'penne', 'macaroni', 'fusilli', 'cooked pasta', 'plain pasta', 'linguine'], 'grain', [158, 5.8, 30.9, 0.9, 1.8, 0.6], 180, '1 generous cup cooked', ['gluten'], 'vegan', { units: { cup: 140, bowl: 250 } }),
  food('whole-wheat-pasta', 'Whole wheat pasta, cooked', ['whole wheat pasta', 'whole grain pasta', 'wholemeal pasta', 'whole wheat spaghetti'], 'grain', [124, 5.3, 26.5, 0.5, 4.5, 0.8], 180, '1 generous cup cooked', ['gluten'], 'vegan', { units: { cup: 140, bowl: 250 } }),
  food('ramen-noodles', 'Ramen noodles, cooked', ['ramen noodles', 'instant noodles', 'egg noodles', 'noodles', 'cooked noodles'], 'grain', [138, 4.5, 26, 2, 1.2, 0.5], 200, '1 bowl cooked', ['gluten', 'egg'], 'vegetarian', { units: { bowl: 250 } }),
  food('rice-noodles', 'Rice noodles, cooked', ['rice noodles', 'vermicelli', 'rice vermicelli'], 'grain', [108, 0.9, 24, 0.2, 1, 0], 175, '1 cup cooked', [], 'vegan', { units: { cup: 175 } }),
  food('couscous', 'Couscous, cooked', ['couscous', 'cooked couscous'], 'grain', [112, 3.8, 23.2, 0.2, 1.4, 0.1], 157, '1 cup cooked', ['gluten'], 'vegan', { units: { cup: 157 } }),
  food('flour-tortilla', 'Flour tortilla', ['tortilla', 'flour tortilla', 'wrap', 'tortilla wrap'], 'grain', [304, 8, 50, 7.8, 3, 2], 45, '1 medium tortilla', ['gluten'], 'vegan', { unitG: 45 }),
  food('corn-tortilla', 'Corn tortilla', ['corn tortilla', 'corn tortillas'], 'grain', [218, 5.7, 44.6, 2.9, 6.3, 0.9], 26, '1 tortilla', [], 'vegan', { unitG: 26 }),
  food('pita', 'Pita bread', ['pita', 'pita bread', 'pitta'], 'grain', [275, 9.1, 55.7, 1.2, 2.2, 1.3], 60, '1 pita', ['gluten'], 'vegan', { unitG: 60 }),
  food('baked-potato', 'Potato, baked', ['baked potato', 'potato', 'jacket potato', 'boiled potato', 'roast potato'], 'grain', [93, 2.5, 21, 0.1, 2.2, 1.2], 173, '1 medium potato', [], 'vegan'),
  food('mashed-potato', 'Mashed potatoes', ['mashed potato', 'mashed potatoes', 'mash'], 'grain', [113, 2, 17, 4.2, 1.4, 1.2], 210, '1 cup', ['dairy'], 'vegetarian', { units: { cup: 210 } }),
  food('sweet-potato', 'Sweet potato, baked', ['sweet potato', 'baked sweet potato', 'yam'], 'grain', [90, 2, 20.7, 0.2, 3.3, 6.5], 130, '1 medium', [], 'vegan'),

  /* ---------------- vegetables ---------------- */
  food('broccoli', 'Broccoli, cooked', ['broccoli', 'steamed broccoli', 'roasted broccoli', 'broccoli florets'], 'vegetable', [35, 2.4, 7.2, 0.4, 3.3, 1.4], 150, '1 cup cooked', [], 'vegan', { units: { cup: 156 } }),
  food('spinach', 'Spinach, raw', ['spinach', 'baby spinach', 'raw spinach'], 'vegetable', [23, 2.9, 3.6, 0.4, 2.2, 0.4], 60, '2 cups raw', [], 'vegan', { units: { cup: 30 } }),
  food('lettuce', 'Lettuce, romaine', ['lettuce', 'romaine', 'romaine lettuce', 'salad greens', 'mixed greens', 'iceberg lettuce'], 'vegetable', [17, 1.2, 3.3, 0.3, 2.1, 1.2], 85, '2 cups shredded', [], 'vegan', { units: { cup: 47 } }),
  food('kale', 'Kale, raw', ['kale', 'raw kale', 'curly kale'], 'vegetable', [35, 2.9, 4.4, 1.5, 4.1, 0.8], 67, '1 cup chopped', [], 'vegan', { units: { cup: 67 } }),
  food('carrot', 'Carrots, raw', ['carrot', 'carrots', 'baby carrots', 'raw carrot'], 'vegetable', [41, 0.9, 9.6, 0.2, 2.8, 4.7], 61, '1 medium carrot', [], 'vegan', { unitG: 61 }),
  food('tomato', 'Tomato, raw', ['tomato', 'tomatoes', 'cherry tomatoes', 'sliced tomato'], 'vegetable', [18, 0.9, 3.9, 0.2, 1.2, 2.6], 123, '1 medium tomato', [], 'vegan', { unitG: 123 }),
  food('cucumber', 'Cucumber', ['cucumber', 'cucumbers', 'sliced cucumber'], 'vegetable', [15, 0.7, 3.6, 0.1, 0.5, 1.7], 100, '1/3 cucumber', [], 'vegan'),
  food('bell-pepper', 'Bell pepper', ['bell pepper', 'bell peppers', 'red pepper', 'green pepper', 'capsicum', 'sweet pepper'], 'vegetable', [31, 1, 6, 0.3, 2.1, 4.2], 120, '1 medium pepper', [], 'vegan', { unitG: 120 }),
  food('onion', 'Onion', ['onion', 'onions', 'sauteed onions', 'grilled onions'], 'vegetable', [40, 1.1, 9.3, 0.1, 1.7, 4.2], 60, '1/2 medium onion', [], 'vegan'),
  food('mushrooms', 'Mushrooms', ['mushroom', 'mushrooms', 'sauteed mushrooms'], 'vegetable', [22, 3.1, 3.3, 0.3, 1, 2], 70, '1 cup sliced', [], 'vegan', { units: { cup: 70 } }),
  food('zucchini', 'Zucchini', ['zucchini', 'courgette', 'grilled zucchini'], 'vegetable', [17, 1.2, 3.1, 0.3, 1, 2.5], 120, '1 small zucchini', [], 'vegan'),
  food('cauliflower', 'Cauliflower', ['cauliflower', 'roasted cauliflower', 'cauliflower rice'], 'vegetable', [25, 1.9, 5, 0.3, 2, 1.9], 100, '1 cup florets', [], 'vegan', { units: { cup: 100 } }),
  food('green-beans', 'Green beans', ['green beans', 'green bean', 'string beans'], 'vegetable', [31, 1.8, 7, 0.2, 2.7, 3.3], 110, '1 cup', [], 'vegan', { units: { cup: 110 } }),
  food('sweet-corn', 'Corn kernels, cooked', ['corn', 'sweet corn', 'corn kernels', 'corn on the cob'], 'vegetable', [96, 3.4, 21, 1.5, 2.4, 4.5], 80, '1/2 cup', [], 'vegan', { units: { cup: 160 } }),
  food('green-peas', 'Green peas', ['peas', 'green peas', 'garden peas'], 'vegetable', [81, 5.4, 14.5, 0.4, 5.7, 5.7], 80, '1/2 cup', [], 'vegan', { units: { cup: 160 } }),
  food('asparagus', 'Asparagus', ['asparagus', 'grilled asparagus', 'asparagus spears'], 'vegetable', [22, 2.4, 4.1, 0.2, 2.1, 1.9], 90, '5 spears', [], 'vegan'),
  food('celery', 'Celery', ['celery', 'celery sticks'], 'vegetable', [14, 0.7, 3, 0.2, 1.6, 1.3], 40, '1 stalk', [], 'vegan', { unitG: 40 }),
  food('cabbage', 'Cabbage', ['cabbage', 'coleslaw cabbage', 'shredded cabbage'], 'vegetable', [25, 1.3, 5.8, 0.1, 2.5, 3.2], 70, '1 cup shredded', [], 'vegan', { units: { cup: 70 } }),
  food('brussels-sprouts', 'Brussels sprouts', ['brussels sprouts', 'brussel sprouts', 'roasted brussels sprouts'], 'vegetable', [36, 2.6, 7.1, 0.5, 2.6, 1.4], 90, '1 cup', [], 'vegan', { units: { cup: 156 } }),
  food('side-salad', 'Side salad with vinaigrette', ['salad', 'side salad', 'green salad', 'garden salad', 'mixed salad'], 'prepared', [60, 1, 5, 4, 1.5, 2.5], 200, '1 side salad', [], 'vegan', { units: { bowl: 250 } }),
  food('caesar-salad', 'Caesar salad with dressing and croutons', ['caesar salad', 'chicken caesar salad'], 'prepared', [190, 5, 8, 15, 1.2, 1.5], 250, '1 entree salad', ['dairy', 'egg', 'gluten', 'fish'], 'pescatarian', { units: { bowl: 300 } }),

  /* ---------------- fruit ---------------- */
  food('apple', 'Apple', ['apple', 'apples', 'red apple', 'green apple'], 'fruit', [52, 0.3, 13.8, 0.2, 2.4, 10.4], 182, '1 medium apple', [], 'vegan'),
  food('banana', 'Banana', ['banana', 'bananas'], 'fruit', [89, 1.1, 22.8, 0.3, 2.6, 12.2], 118, '1 medium banana', [], 'vegan'),
  food('orange', 'Orange', ['orange', 'oranges', 'mandarin', 'clementine', 'tangerine'], 'fruit', [47, 0.9, 11.8, 0.1, 2.4, 9.4], 131, '1 medium orange', [], 'vegan'),
  food('strawberries', 'Strawberries', ['strawberry', 'strawberries'], 'fruit', [32, 0.7, 7.7, 0.3, 2, 4.9], 150, '1 cup', [], 'vegan', { units: { cup: 150 } }),
  food('blueberries', 'Blueberries', ['blueberry', 'blueberries'], 'fruit', [57, 0.7, 14.5, 0.3, 2.4, 10], 100, '2/3 cup', [], 'vegan', { units: { cup: 148 } }),
  food('raspberries', 'Raspberries', ['raspberry', 'raspberries'], 'fruit', [52, 1.2, 11.9, 0.7, 6.5, 4.4], 120, '1 cup', [], 'vegan', { units: { cup: 123 } }),
  food('grapes', 'Grapes', ['grape', 'grapes', 'red grapes', 'green grapes'], 'fruit', [69, 0.7, 18.1, 0.2, 0.9, 15.5], 100, '2/3 cup', [], 'vegan', { units: { cup: 151 } }),
  food('watermelon', 'Watermelon', ['watermelon', 'watermelon slice'], 'fruit', [30, 0.6, 7.6, 0.2, 0.4, 6.2], 280, '1 wedge', [], 'vegan', { units: { cup: 152, slice: 280 } }),
  food('pineapple', 'Pineapple', ['pineapple', 'pineapple chunks'], 'fruit', [50, 0.5, 13.1, 0.1, 1.4, 9.9], 165, '1 cup chunks', [], 'vegan', { units: { cup: 165 } }),
  food('mango', 'Mango', ['mango', 'mangoes', 'mango slices'], 'fruit', [60, 0.8, 15, 0.4, 1.6, 13.7], 165, '1 cup sliced', [], 'vegan', { units: { cup: 165 } }),
  food('pear', 'Pear', ['pear', 'pears'], 'fruit', [57, 0.4, 15.2, 0.1, 3.1, 9.8], 178, '1 medium pear', [], 'vegan'),
  food('peach', 'Peach', ['peach', 'peaches', 'nectarine'], 'fruit', [39, 0.9, 9.5, 0.3, 1.5, 8.4], 150, '1 medium peach', [], 'vegan'),
  food('kiwi', 'Kiwi', ['kiwi', 'kiwifruit', 'kiwi fruit'], 'fruit', [61, 1.1, 14.7, 0.5, 3, 9], 75, '1 kiwi', [], 'vegan', { unitG: 75 }),
  food('raisins', 'Raisins', ['raisin', 'raisins', 'dried fruit', 'sultanas'], 'fruit', [299, 3.1, 79.2, 0.5, 3.7, 59], 40, '1 small box', [], 'vegan', { units: { handful: 30 } }),
  food('dates', 'Dates', ['date', 'dates', 'medjool dates'], 'fruit', [282, 2.5, 75, 0.4, 8, 63], 48, '2 dates', [], 'vegan', { unitG: 24 }),
  food('applesauce', 'Applesauce, unsweetened', ['applesauce', 'apple sauce'], 'fruit', [42, 0.2, 11.3, 0.1, 1.2, 9.4], 120, '1/2 cup', [], 'vegan', { units: { cup: 244 } }),

  /* ---------------- dairy ---------------- */
  food('milk-whole', 'Milk, whole', ['whole milk', 'full fat milk', 'full cream milk'], 'dairy', [61, 3.2, 4.8, 3.3, 0, 5.1], 244, '1 cup', ['dairy'], 'vegetarian', { units: { cup: 244, glass: 244 } }),
  food('milk-2', 'Milk, 2%', ['milk', 'two percent milk', 'reduced fat milk', 'semi skimmed milk', 'glass of milk'], 'dairy', [50, 3.3, 4.8, 2, 0, 5.1], 244, '1 cup', ['dairy'], 'vegetarian', { units: { cup: 244, glass: 244 } }),
  food('milk-skim', 'Milk, skim', ['skim milk', 'skimmed milk', 'nonfat milk', 'fat free milk'], 'dairy', [34, 3.4, 5, 0.1, 0, 5], 244, '1 cup', ['dairy'], 'vegetarian', { units: { cup: 244, glass: 244 } }),
  food('almond-milk', 'Almond milk, unsweetened', ['almond milk'], 'dairy', [15, 0.6, 0.6, 1.2, 0.2, 0], 240, '1 cup', ['tree-nut'], 'vegan', { units: { cup: 240, glass: 240 } }),
  food('oat-milk', 'Oat milk', ['oat milk'], 'dairy', [48, 1, 7, 1.5, 0.8, 4], 240, '1 cup', ['gluten'], 'vegan', { units: { cup: 240, glass: 240 } }),
  food('soy-milk', 'Soy milk, unsweetened', ['soy milk', 'soya milk'], 'dairy', [33, 2.9, 1.7, 1.6, 0.4, 0.4], 240, '1 cup', ['soy'], 'vegan', { units: { cup: 240, glass: 240 } }),
  food('greek-yogurt', 'Greek yogurt, plain nonfat', ['greek yogurt', 'greek yoghurt', 'nonfat greek yogurt', 'fat free greek yogurt'], 'dairy', [59, 10.2, 3.6, 0.4, 0, 3.2], 170, '1 container (6 oz)', ['dairy'], 'vegetarian', { units: { cup: 245 } }),
  food('fruit-yogurt', 'Yogurt, fruit flavored', ['yogurt', 'yoghurt', 'fruit yogurt', 'flavored yogurt', 'strawberry yogurt', 'vanilla yogurt'], 'dairy', [99, 3.7, 18, 1.4, 0, 16.5], 170, '1 container (6 oz)', ['dairy'], 'vegetarian', { units: { cup: 245 } }),
  food('cottage-cheese', 'Cottage cheese, low-fat', ['cottage cheese', 'low fat cottage cheese'], 'dairy', [81, 10.5, 4.8, 2.3, 0, 4], 113, '1/2 cup', ['dairy'], 'vegetarian', { units: { cup: 226 } }),
  food('cheddar', 'Cheddar cheese', ['cheddar', 'cheddar cheese', 'cheese', 'cheese slice', 'sliced cheese', 'american cheese', 'swiss cheese'], 'dairy', [403, 24.9, 1.3, 33.1, 0, 0.5], 28, '1 oz (about 1 slice)', ['dairy'], 'vegetarian', { units: { slice: 21, cup: 113 } }),
  food('mozzarella', 'Mozzarella cheese', ['mozzarella', 'mozzarella cheese', 'string cheese', 'shredded mozzarella'], 'dairy', [300, 22.2, 2.2, 22.4, 0, 1], 28, '1 oz', ['dairy'], 'vegetarian', { units: { slice: 28 } }),
  food('parmesan', 'Parmesan cheese, grated', ['parmesan', 'parmesan cheese', 'grated parmesan', 'parmigiano'], 'dairy', [431, 38, 4.1, 29, 0, 0.9], 10, '2 tbsp grated', ['dairy'], 'vegetarian', { units: { tbsp: 5 } }),
  food('feta', 'Feta cheese', ['feta', 'feta cheese'], 'dairy', [264, 14, 4, 21, 0, 4], 28, '1 oz', ['dairy'], 'vegetarian'),
  food('cream-cheese', 'Cream cheese', ['cream cheese'], 'dairy', [342, 6, 4, 34, 0, 3.2], 30, '2 tbsp', ['dairy'], 'vegetarian', { units: { tbsp: 15 } }),
  food('butter', 'Butter', ['butter'], 'fats', [717, 0.9, 0.1, 81, 0, 0.1], 14, '1 tbsp', ['dairy'], 'vegetarian', { units: { tbsp: 14, tsp: 5 } }),
  food('sour-cream', 'Sour cream', ['sour cream'], 'dairy', [198, 2.4, 4.6, 19.4, 0, 3.4], 24, '2 tbsp', ['dairy'], 'vegetarian', { units: { tbsp: 12 } }),
  food('ice-cream', 'Ice cream, vanilla', ['ice cream', 'vanilla ice cream', 'gelato', 'scoop of ice cream'], 'sweets', [207, 3.5, 23.6, 11, 0.7, 21], 100, '1 generous scoop', ['dairy'], 'vegetarian', { units: { scoop: 66, cup: 132 } }),

  /* ---------------- nuts, seeds, legumes ---------------- */
  food('almonds', 'Almonds', ['almond', 'almonds', 'raw almonds'], 'nuts', [579, 21.2, 21.6, 49.9, 12.5, 4.4], 28, '1 oz (a small handful)', ['tree-nut'], 'vegan', { units: { handful: 28 } }),
  food('walnuts', 'Walnuts', ['walnut', 'walnuts'], 'nuts', [654, 15.2, 13.7, 65.2, 6.7, 2.6], 28, '1 oz', ['tree-nut'], 'vegan', { units: { handful: 28 } }),
  food('cashews', 'Cashews', ['cashew', 'cashews', 'cashew nuts'], 'nuts', [553, 18.2, 30.2, 43.9, 3.3, 5.9], 28, '1 oz', ['tree-nut'], 'vegan', { units: { handful: 28 } }),
  food('peanuts', 'Peanuts, roasted', ['peanut', 'peanuts', 'roasted peanuts', 'salted peanuts'], 'nuts', [585, 25.8, 16.1, 49.2, 8.5, 4.7], 28, '1 oz', ['peanut'], 'vegan', { units: { handful: 28 } }),
  food('trail-mix', 'Trail mix', ['trail mix', 'nut mix', 'mixed nuts'], 'nuts', [462, 14, 44, 29, 5, 25], 40, '1/4 cup', ['peanut', 'tree-nut'], 'vegan', { units: { handful: 35 } }),
  food('peanut-butter', 'Peanut butter', ['peanut butter', 'pb'], 'nuts', [588, 25, 20, 50, 6, 9], 32, '2 tbsp', ['peanut'], 'vegan', { units: { tbsp: 16, tsp: 5 } }),
  food('almond-butter', 'Almond butter', ['almond butter'], 'nuts', [614, 21, 19, 56, 10, 4], 32, '2 tbsp', ['tree-nut'], 'vegan', { units: { tbsp: 16, tsp: 5 } }),
  food('chia-seeds', 'Chia seeds', ['chia', 'chia seeds', 'chia pudding'], 'nuts', [486, 16.5, 42.1, 30.7, 34.4, 0], 12, '1 tbsp', [], 'vegan', { units: { tbsp: 12 } }),
  food('sunflower-seeds', 'Sunflower seeds', ['sunflower seeds', 'pumpkin seeds', 'seeds'], 'nuts', [584, 20.8, 20, 51.5, 8.6, 2.6], 28, '1 oz', [], 'vegan', { units: { handful: 28 } }),
  food('hummus', 'Hummus', ['hummus', 'houmous', 'chickpea dip'], 'legume', [166, 7.9, 14.3, 9.6, 6, 0.3], 60, '4 tbsp', ['sesame'], 'vegan', { units: { tbsp: 15 } }),
  food('black-beans', 'Black beans, cooked', ['black beans', 'black bean', 'beans', 'kidney beans', 'pinto beans', 'cooked beans'], 'legume', [132, 8.9, 23.7, 0.5, 8.7, 0.3], 130, '3/4 cup', [], 'vegan', { units: { cup: 172 } }),
  food('chickpeas', 'Chickpeas, cooked', ['chickpeas', 'chickpea', 'garbanzo beans', 'garbanzos'], 'legume', [164, 8.9, 27.4, 2.6, 7.6, 4.8], 130, '3/4 cup', [], 'vegan', { units: { cup: 164 } }),
  food('lentils', 'Lentils, cooked', ['lentils', 'lentil', 'cooked lentils', 'dal', 'dhal'], 'legume', [116, 9, 20.1, 0.4, 7.9, 1.8], 150, '3/4 cup', [], 'vegan', { units: { cup: 198 } }),
  food('edamame', 'Edamame', ['edamame', 'soybeans', 'soy beans'], 'legume', [121, 11.9, 8.9, 5.2, 5.2, 2.2], 100, '1/2 cup shelled', ['soy'], 'vegan', { units: { cup: 155 } }),
  food('baked-beans', 'Baked beans, canned', ['baked beans', 'beans on toast'], 'legume', [94, 4.7, 21, 0.4, 5.5, 8], 130, '1/2 cup', [], 'vegan', { units: { cup: 254 } }),

  /* ---------------- fast food and prepared dishes ---------------- */
  food('cheeseburger', 'Cheeseburger', ['cheeseburger', 'cheese burger', 'burger', 'double cheeseburger', 'big mac', 'whopper', 'quarter pounder'], 'fast-food', [263, 13.4, 24, 12.9, 1.2, 5], 170, '1 regular cheeseburger', ['gluten', 'dairy', 'sesame'], 'omnivore'),
  food('hamburger', 'Hamburger', ['hamburger', 'plain hamburger', 'beef burger'], 'fast-food', [250, 14, 27, 9, 1.2, 5], 140, '1 regular hamburger', ['gluten', 'sesame'], 'omnivore'),
  food('french-fries', 'French fries', ['french fries', 'fries', 'fast food fries', 'potato fries'], 'fast-food', [312, 3.4, 41, 15, 3.8, 0.3], 115, '1 medium order', [], 'vegan', { units: { handful: 40 } }),
  food('cheese-pizza', 'Pizza, cheese', ['pizza', 'cheese pizza', 'pizza slice', 'margherita pizza', 'slice of pizza'], 'fast-food', [266, 11, 33, 10, 2.3, 3.6], 107, '1 slice', ['gluten', 'dairy'], 'vegetarian', { units: { slice: 107 } }),
  food('pepperoni-pizza', 'Pizza, pepperoni', ['pepperoni pizza', 'pepperoni pizza slice', 'meat pizza', 'sausage pizza'], 'fast-food', [298, 12, 30, 14, 2.2, 3.5], 111, '1 slice', ['gluten', 'dairy'], 'omnivore', { units: { slice: 111 } }),
  food('hot-dog', 'Hot dog in bun', ['hot dog', 'hotdog', 'corn dog', 'frankfurter'], 'fast-food', [247, 10.4, 18, 15, 1, 4], 100, '1 hot dog with bun', ['gluten'], 'omnivore'),
  food('chicken-nuggets', 'Chicken nuggets', ['chicken nuggets', 'nuggets', 'chicken nugget'], 'fast-food', [296, 15, 18, 18, 1, 0.5], 96, '6 nuggets', ['gluten', 'egg'], 'omnivore', { unitG: 16 }),
  food('burrito', 'Burrito (chicken, rice, beans)', ['burrito', 'chicken burrito', 'bean burrito'], 'fast-food', [150, 8, 18, 5, 2.5, 1.5], 300, '1 burrito', ['gluten', 'dairy'], 'omnivore'),
  food('burrito-bowl', 'Burrito bowl (chicken, rice, beans)', ['burrito bowl', 'chicken burrito bowl', 'rice bowl'], 'prepared', [135, 9, 16, 4, 3, 1.5], 400, '1 bowl', ['dairy'], 'omnivore', { units: { bowl: 400 } }),
  food('taco', 'Taco, beef', ['taco', 'tacos', 'beef taco', 'beef tacos', 'hard shell taco'], 'fast-food', [226, 10, 18, 13, 2.5, 1.5], 160, '2 tacos', ['dairy'], 'omnivore', { unitG: 80 }),
  food('quesadilla', 'Quesadilla, cheese', ['quesadilla', 'cheese quesadilla', 'chicken quesadilla'], 'fast-food', [282, 14, 25, 14, 1.5, 1.5], 150, '1/2 large quesadilla', ['gluten', 'dairy'], 'vegetarian'),
  food('turkey-sandwich', 'Turkey sandwich', ['turkey sandwich', 'sandwich', 'deli sandwich', 'club sandwich', 'chicken sandwich'], 'fast-food', [194, 13, 22, 6, 1.8, 3], 200, '1 sandwich', ['gluten', 'egg'], 'omnivore'),
  food('grilled-cheese', 'Grilled cheese sandwich', ['grilled cheese', 'grilled cheese sandwich', 'cheese toastie', 'toasted cheese sandwich'], 'fast-food', [353, 13, 28, 21, 1.5, 4], 130, '1 sandwich', ['gluten', 'dairy'], 'vegetarian'),
  food('mac-and-cheese', 'Macaroni and cheese', ['mac and cheese', 'macaroni and cheese', 'mac n cheese', 'mac cheese'], 'prepared', [168, 6.9, 20, 6.7, 1, 3], 200, '1 cup', ['gluten', 'dairy'], 'vegetarian', { units: { cup: 200, bowl: 300 } }),
  food('spaghetti-bolognese', 'Spaghetti with meat sauce', ['spaghetti bolognese', 'spaghetti with meat sauce', 'bolognese', 'pasta with meat sauce', 'spaghetti and meatballs'], 'prepared', [120, 6, 15, 4, 1.5, 3], 300, '1 plate', ['gluten'], 'omnivore', { units: { bowl: 350 } }),
  food('lasagna', 'Lasagna', ['lasagna', 'lasagne', 'meat lasagna'], 'prepared', [133, 8, 14, 5, 1.2, 3], 250, '1 piece', ['gluten', 'dairy', 'egg'], 'omnivore', { units: { piece: 250 } }),
  food('chicken-fried-rice', 'Chicken fried rice', ['fried rice', 'chicken fried rice', 'shrimp fried rice'], 'prepared', [165, 6, 24, 5, 1, 1.5], 200, '1 cup', ['egg', 'soy'], 'omnivore', { units: { cup: 198, bowl: 300 } }),
  food('vegetable-fried-rice', 'Vegetable fried rice', ['vegetable fried rice', 'egg fried rice', 'veggie fried rice'], 'prepared', [150, 4, 25, 4, 1.5, 1.5], 200, '1 cup', ['egg', 'soy'], 'vegetarian', { units: { cup: 198, bowl: 300 } }),
  food('sushi-roll', 'Sushi roll (California)', ['sushi', 'sushi roll', 'california roll', 'maki roll', 'sushi rolls'], 'prepared', [140, 3.5, 26, 2.5, 1, 4], 180, '6 pieces', ['fish', 'soy', 'sesame'], 'pescatarian', { unitG: 30 }),
  food('pad-thai', 'Pad Thai', ['pad thai', 'pad thai noodles', 'thai noodles'], 'prepared', [161, 7, 22, 5, 1.5, 4], 300, '1 plate', ['peanut', 'egg', 'soy', 'shellfish', 'fish'], 'pescatarian', { units: { bowl: 350 } }),
  food('chicken-tikka-masala', 'Chicken tikka masala', ['chicken tikka masala', 'tikka masala', 'butter chicken', 'chicken curry', 'curry'], 'prepared', [143, 12, 7, 7.5, 1.2, 3], 250, '1 serving', ['dairy', 'tree-nut'], 'omnivore', { units: { bowl: 300 } }),
  food('chili', 'Chili con carne', ['chili', 'chilli', 'chili con carne', 'beef chili'], 'prepared', [125, 9, 11, 5, 3.5, 3], 250, '1 bowl', [], 'omnivore', { units: { bowl: 300, cup: 250 } }),
  food('chicken-noodle-soup', 'Chicken noodle soup', ['chicken noodle soup', 'chicken soup', 'noodle soup'], 'prepared', [39, 3, 4.5, 1, 0.3, 0.5], 245, '1 cup', ['gluten', 'egg'], 'omnivore', { units: { cup: 245, bowl: 350 } }),
  food('tomato-soup', 'Tomato soup', ['tomato soup', 'soup', 'vegetable soup', 'cream of tomato soup'], 'prepared', [43, 1, 8, 0.8, 1, 5], 245, '1 cup', ['dairy'], 'vegetarian', { units: { cup: 245, bowl: 350 } }),
  food('chicken-stir-fry', 'Chicken and vegetable stir-fry', ['stir fry', 'stir-fry', 'chicken stir fry', 'chicken and vegetable stir fry', 'veggie stir fry'], 'prepared', [108, 11, 7, 4, 1.5, 3], 250, '1 serving', ['soy'], 'omnivore', { units: { cup: 200, bowl: 300 } }),
  food('guacamole', 'Guacamole', ['guacamole', 'guac'], 'fats', [159, 2, 8.5, 13, 5.5, 1], 60, '1/4 cup', [], 'vegan', { units: { tbsp: 15 } }),
  food('avocado', 'Avocado', ['avocado', 'avocados', 'sliced avocado', 'avo'], 'fruit', [160, 2, 8.5, 14.7, 6.7, 0.7], 136, '1 medium avocado', [], 'vegan'),

  /* ---------------- sweets and snacks ---------------- */
  food('dark-chocolate', 'Dark chocolate', ['dark chocolate', 'chocolate', 'chocolate square', 'chocolate bar dark'], 'sweets', [546, 4.9, 61, 31, 7, 48], 28, '1 oz (about 3 squares)', ['soy'], 'vegan', { unitG: 10 }),
  food('milk-chocolate', 'Milk chocolate', ['milk chocolate', 'chocolate candy bar', 'candy bar', 'chocolate bar'], 'sweets', [535, 7.7, 59.4, 29.7, 3.4, 51.5], 43, '1 bar', ['dairy', 'soy'], 'vegetarian'),
  food('chocolate-chip-cookie', 'Chocolate chip cookie', ['cookie', 'cookies', 'chocolate chip cookie', 'chocolate chip cookies'], 'sweets', [488, 5, 64, 24, 2.5, 35], 30, '1 medium cookie', ['gluten', 'egg', 'dairy'], 'vegetarian', { unitG: 30 }),
  food('brownie', 'Brownie', ['brownie', 'brownies', 'chocolate brownie'], 'sweets', [466, 5, 59, 24, 2.5, 38], 60, '1 square', ['gluten', 'egg', 'dairy'], 'vegetarian'),
  food('donut', 'Donut, glazed', ['donut', 'doughnut', 'donuts', 'doughnuts', 'glazed donut'], 'sweets', [452, 4.9, 51, 25, 1.5, 22], 60, '1 donut', ['gluten', 'egg', 'dairy'], 'vegetarian', { unitG: 60 }),
  food('chocolate-cake', 'Cake, chocolate with frosting', ['cake', 'chocolate cake', 'slice of cake', 'birthday cake', 'cupcake', 'frosted cake'], 'sweets', [371, 4, 53, 16, 2, 40], 100, '1 slice', ['gluten', 'egg', 'dairy'], 'vegetarian', { units: { slice: 100 } }),
  food('gummy-candy', 'Gummy candy', ['gummy', 'gummies', 'gummy bears', 'candy', 'sweets', 'jelly beans'], 'sweets', [343, 6.9, 77, 0.1, 0, 46], 40, '1 small bag', [], 'omnivore', { units: { handful: 30 } }),
  food('jam', 'Jam or jelly', ['jam', 'jelly', 'jelly jam', 'marmalade', 'fruit preserves'], 'sweets', [250, 0.4, 65, 0.1, 1, 48], 20, '1 tbsp', [], 'vegan', { units: { tbsp: 20 } }),
  food('honey', 'Honey', ['honey'], 'sweets', [304, 0.3, 82, 0, 0.2, 82], 21, '1 tbsp', [], 'vegetarian', { units: { tbsp: 21, tsp: 7 } }),
  food('sugar', 'Sugar, white', ['sugar', 'white sugar', 'brown sugar', 'cane sugar'], 'sweets', [387, 0, 100, 0, 0, 100], 4, '1 tsp', [], 'vegan', { units: { tsp: 4, tbsp: 12 } }),
  food('potato-chips', 'Potato chips', ['chips', 'potato chips', 'crisps', 'bag of chips'], 'snacks', [536, 7, 53, 35, 4.4, 0.3], 28, '1 oz (small bag)', [], 'vegan', { units: { handful: 28 } }),
  food('tortilla-chips', 'Tortilla chips', ['tortilla chips', 'nacho chips', 'corn chips'], 'snacks', [487, 7, 63, 23, 5, 1], 28, '1 oz', [], 'vegan', { units: { handful: 28 } }),
  food('popcorn', 'Popcorn, air-popped', ['popcorn', 'air popped popcorn', 'plain popcorn'], 'snacks', [387, 13, 78, 4.5, 14.5, 0.9], 24, '3 cups popped', [], 'vegan', { units: { cup: 8, bowl: 30 } }),
  food('pretzels', 'Pretzels', ['pretzel', 'pretzels', 'pretzel twists'], 'snacks', [380, 9, 80, 3, 3, 3], 28, '1 oz', ['gluten'], 'vegan', { units: { handful: 28 } }),
  food('rice-cake', 'Rice cake', ['rice cake', 'rice cakes', 'puffed rice cake'], 'snacks', [383, 8, 81.5, 2.8, 4, 0.9], 9, '1 cake', [], 'vegan', { unitG: 9 }),
  food('granola-bar', 'Granola bar', ['granola bar', 'cereal bar', 'muesli bar', 'oat bar'], 'snacks', [425, 7, 70, 13, 4, 30], 28, '1 bar', ['gluten', 'peanut'], 'vegetarian', { unitG: 28 }),
  food('protein-bar', 'Protein bar', ['protein bar', 'energy bar', 'protein bars'], 'snacks', [388, 33, 37, 12, 6, 15], 60, '1 bar', ['dairy', 'soy', 'peanut'], 'vegetarian', { unitG: 60 }),

  /* ---------------- drinks ---------------- */
  food('water', 'Water', ['water', 'sparkling water', 'seltzer', 'mineral water', 'glass of water'], 'drinks', [0, 0, 0, 0, 0, 0], 240, '1 glass', [], 'vegan', { units: { glass: 240, cup: 240, can: 355 } }),
  food('black-coffee', 'Coffee, black', ['coffee', 'black coffee', 'americano', 'espresso', 'brewed coffee', 'cup of coffee'], 'drinks', [1, 0.1, 0, 0, 0, 0], 240, '1 cup', [], 'vegan', { units: { cup: 240, glass: 240 } }),
  food('latte', 'Latte, whole milk', ['latte', 'cappuccino', 'flat white', 'milk coffee', 'cafe latte', 'coffee with milk'], 'drinks', [55, 3, 4.7, 2.9, 0, 4.5], 350, '1 medium latte', ['dairy'], 'vegetarian', { units: { cup: 350, glass: 350 } }),
  food('tea', 'Tea, unsweetened', ['tea', 'black tea', 'green tea', 'herbal tea', 'iced tea unsweetened', 'cup of tea'], 'drinks', [1, 0, 0.2, 0, 0, 0], 240, '1 cup', [], 'vegan', { units: { cup: 240, glass: 240 } }),
  food('orange-juice', 'Orange juice', ['orange juice', 'oj', 'fruit juice', 'juice'], 'drinks', [45, 0.7, 10.4, 0.2, 0.2, 8.4], 248, '1 cup', [], 'vegan', { units: { cup: 248, glass: 248 } }),
  food('apple-juice', 'Apple juice', ['apple juice'], 'drinks', [46, 0.1, 11.4, 0.1, 0.2, 9.6], 248, '1 cup', [], 'vegan', { units: { cup: 248, glass: 248 } }),
  food('cola', 'Soda (cola)', ['soda', 'cola', 'coke', 'pepsi', 'soft drink', 'pop', 'fizzy drink', 'sugary soda', 'lemonade', 'sprite'], 'drinks', [42, 0, 10.6, 0, 0, 10.6], 355, '1 can (12 oz)', [], 'vegan', { units: { can: 355, glass: 250, cup: 240 } }),
  food('diet-soda', 'Diet soda', ['diet soda', 'diet coke', 'diet cola', 'zero sugar soda', 'coke zero', 'sugar free soda'], 'drinks', [0, 0, 0, 0, 0, 0], 355, '1 can (12 oz)', [], 'vegan', { units: { can: 355, glass: 250, cup: 240 } }),
  food('sports-drink', 'Sports drink', ['sports drink', 'gatorade', 'electrolyte drink', 'powerade'], 'drinks', [26, 0, 6.4, 0, 0, 5.8], 355, '1 bottle (12 oz)', [], 'vegan', { units: { can: 355, glass: 355 } }),
  food('energy-drink', 'Energy drink', ['energy drink', 'red bull', 'monster'], 'drinks', [45, 0, 11, 0, 0, 11], 250, '1 can (8.4 oz)', [], 'vegan', { units: { can: 250 } }),
  food('beer', 'Beer', ['beer', 'lager', 'ale', 'pint of beer', 'light beer'], 'drinks', [43, 0.5, 3.6, 0, 0, 0], 355, '1 can (12 oz)', ['gluten'], 'vegan', { alcohol: true, units: { can: 355, glass: 355 } }),
  food('wine', 'Wine', ['wine', 'red wine', 'white wine', 'glass of wine', 'prosecco'], 'drinks', [83, 0.1, 2.6, 0, 0, 0.6], 150, '1 glass (5 oz)', [], 'vegan', { alcohol: true, units: { glass: 150, cup: 240 } }),
  food('fruit-smoothie', 'Fruit smoothie', ['smoothie', 'fruit smoothie', 'berry smoothie', 'banana smoothie'], 'drinks', [66, 1, 15, 0.3, 1, 12], 350, '1 medium smoothie', ['dairy'], 'vegetarian', { units: { cup: 245, glass: 350 } }),
  food('milkshake', 'Milkshake, chocolate', ['milkshake', 'chocolate milkshake', 'vanilla milkshake', 'shake milk'], 'drinks', [115, 3.1, 18, 3.4, 0.5, 17], 350, '1 medium shake', ['dairy'], 'vegetarian', { units: { glass: 350 } }),
  food('coconut-water', 'Coconut water', ['coconut water'], 'drinks', [19, 0.7, 3.7, 0.2, 1.1, 2.6], 240, '1 cup', [], 'vegan', { units: { cup: 240, glass: 240 } }),

  /* ---------------- oils, dressings and sauces ---------------- */
  food('olive-oil', 'Olive oil', ['olive oil', 'oil', 'cooking oil', 'vegetable oil', 'extra virgin olive oil', 'coconut oil'], 'fats', [884, 0, 0, 100, 0, 0], 14, '1 tbsp', [], 'vegan', { units: { tbsp: 14, tsp: 4.5 } }),
  food('mayonnaise', 'Mayonnaise', ['mayonnaise', 'mayo'], 'fats', [680, 1, 0.6, 75, 0, 0.6], 14, '1 tbsp', ['egg'], 'vegetarian', { units: { tbsp: 14, tsp: 5 } }),
  food('ketchup', 'Ketchup', ['ketchup', 'tomato ketchup', 'catsup'], 'fats', [101, 1, 27, 0.1, 0.3, 22], 17, '1 tbsp', [], 'vegan', { units: { tbsp: 17 } }),
  food('ranch-dressing', 'Ranch dressing', ['ranch', 'ranch dressing', 'creamy dressing', 'blue cheese dressing'], 'fats', [430, 1, 6, 44, 0, 3], 30, '2 tbsp', ['dairy', 'egg'], 'vegetarian', { units: { tbsp: 15 } }),
  food('vinaigrette', 'Vinaigrette dressing', ['vinaigrette', 'italian dressing', 'balsamic vinaigrette', 'salad dressing', 'dressing'], 'fats', [294, 0.1, 6, 30, 0, 4], 30, '2 tbsp', [], 'vegan', { units: { tbsp: 15 } }),
  food('soy-sauce', 'Soy sauce', ['soy sauce', 'tamari'], 'fats', [57, 8, 4.9, 0.6, 0.8, 0.4], 16, '1 tbsp', ['soy', 'gluten'], 'vegan', { units: { tbsp: 16 } }),
  food('bbq-sauce', 'Barbecue sauce', ['bbq sauce', 'barbecue sauce', 'barbeque sauce'], 'fats', [172, 0.8, 41, 0.6, 0.9, 33], 35, '2 tbsp', [], 'vegan', { units: { tbsp: 17 } }),
  food('tomato-sauce', 'Tomato pasta sauce', ['tomato sauce', 'marinara', 'pasta sauce', 'marinara sauce'], 'fats', [50, 1.5, 8, 1.5, 1.8, 5], 125, '1/2 cup', [], 'vegan', { units: { cup: 250, tbsp: 16 } }),
  food('salsa', 'Salsa', ['salsa', 'pico de gallo', 'tomato salsa'], 'fats', [36, 1.5, 7, 0.2, 1.5, 4], 32, '2 tbsp', [], 'vegan', { units: { tbsp: 16, cup: 260 } }),
];

const byId = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id: string): Food | undefined {
  return byId.get(id);
}
