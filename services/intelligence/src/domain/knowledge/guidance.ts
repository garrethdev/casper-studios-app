import type { Guidance } from './types';

/**
 * Short, plain, general nutrition and weight-loss guidance. These are common
 * habits, not medical advice and not a personal plan. Each snippet opens with
 * one short sentence that can be used on its own as a tip.
 */
export const GUIDANCE_LABEL = 'General guidance, not medical advice';

export const GUIDANCE: readonly Guidance[] = [
  /* ---------- protein and fullness ---------- */
  {
    id: 'protein-satiety',
    title: 'Protein helps you feel full',
    text: 'Protein tends to keep you full for longer than carbs or fat do. Many people find it easier to stick to a plan when each meal has a palm-sized portion of eggs, fish, poultry, tofu, beans or yogurt.',
    tags: ['low-protein', 'light-meal'],
  },
  {
    id: 'protein-breakfast',
    title: 'Start the day with protein',
    text: 'A protein-rich breakfast can help you feel steady until lunch. Try eggs, Greek yogurt or cottage cheese instead of a pastry or sugary cereal on its own.',
    tags: ['low-protein', 'high-sugar'],
  },
  {
    id: 'protein-swap',
    title: 'Add a lean protein',
    text: 'Add a lean protein to a carb-heavy plate. A small portion of chicken, tuna, tofu or lentils next to pasta or rice balances the meal and adds staying power.',
    tags: ['low-protein'],
  },
  {
    id: 'protein-snack',
    title: 'Pair snacks with protein',
    text: 'Pair a snack with protein. Fruit with a spoon of peanut butter, or crackers with cheese, lasts longer than fruit or crackers alone.',
    tags: ['low-protein', 'light-meal'],
  },
  {
    id: 'protein-spread',
    title: 'Spread protein through the day',
    text: 'Spread your protein across the day instead of saving it for dinner. A little at each meal makes hunger easier to manage.',
    tags: ['low-protein'],
  },

  /* ---------- fiber ---------- */
  {
    id: 'fiber-fullness',
    title: 'Fiber adds volume and fullness',
    text: 'Fiber adds bulk without many calories, so you feel fuller on the same plate. Vegetables, beans, lentils, oats, fruit and whole grains are easy sources.',
    tags: ['low-fiber', 'high-energy-density'],
  },
  {
    id: 'fiber-half-plate',
    title: 'Fill half your plate with vegetables',
    text: 'Fill about half your plate with vegetables. It is a simple way to add fiber and volume, and it leaves less room for the heavier foods.',
    tags: ['low-fiber', 'over-budget', 'high-energy-density'],
  },
  {
    id: 'fiber-whole-grains',
    title: 'Choose whole grains more often',
    text: 'Swap refined grains for whole grains when you can. Brown rice, whole wheat bread and oats bring more fiber than their white versions.',
    tags: ['low-fiber'],
  },
  {
    id: 'fiber-beans',
    title: 'Beans and lentils are easy wins',
    text: 'Beans and lentils pack fiber and protein together. Stir a spoonful into soups, salads or rice bowls.',
    tags: ['low-fiber', 'low-protein'],
  },
  {
    id: 'fiber-fruit-whole',
    title: 'Whole fruit beats juice',
    text: 'Choose whole fruit over juice. The skin and pulp keep the fiber, and chewing makes it more filling.',
    tags: ['low-fiber', 'high-sugar'],
  },

  /* ---------- sugar and liquid calories ---------- */
  {
    id: 'sugar-added',
    title: 'Watch added sugar',
    text: 'Added sugar adds calories without much fullness. Sweets, sweetened drinks and sauces are the usual sources, and small cuts add up over a week.',
    tags: ['high-sugar'],
  },
  {
    id: 'sugar-drinks',
    title: 'Liquid calories add up quickly',
    text: 'Drinks do not fill you up the way food does. Swapping a regular soda, juice or sweet coffee for water, sparkling water or unsweetened tea saves calories with little effort.',
    tags: ['high-sugar', 'over-budget', 'high-energy-density'],
  },
  {
    id: 'sugar-dessert',
    title: 'Enjoy sweets on purpose',
    text: 'Enjoy dessert on purpose rather than by habit. A smaller portion eaten slowly can be just as satisfying as a large one.',
    tags: ['high-sugar', 'over-budget'],
  },
  {
    id: 'sugar-cereal',
    title: 'Check sweetened breakfast foods',
    text: 'Breakfast cereals, flavored yogurts and granolas can hide a lot of sugar. Plain versions with fruit on top keep the sweetness but cut the extra.',
    tags: ['high-sugar'],
  },
  {
    id: 'sugar-pair',
    title: 'Pair sweet foods with protein or fiber',
    text: 'If you want something sweet, pair it with protein or fiber. Berries with yogurt feel more satisfying than candy on its own.',
    tags: ['high-sugar'],
  },

  /* ---------- energy density and portions ---------- */
  {
    id: 'energy-density',
    title: 'Foods differ in calories per bite',
    text: 'Some foods pack many calories into a small bite, like fried foods, oils, cheese and pastries. Pairing them with vegetables, fruit or broth helps meals feel larger for the same calories.',
    tags: ['high-energy-density', 'over-budget'],
  },
  {
    id: 'energy-sauces',
    title: 'Sauces and oils are calorie-dense',
    text: 'Dressings, sauces and cooking oil can add more calories than people expect. Measure them with a spoon or ask for them on the side.',
    tags: ['high-energy-density', 'over-budget'],
  },
  {
    id: 'energy-fried',
    title: 'Try baked, grilled or roasted',
    text: 'Baking, grilling or roasting usually uses less oil than frying. The flavor stays and the calories often drop noticeably.',
    tags: ['high-energy-density'],
  },
  {
    id: 'portion-size',
    title: 'Portion size matters most',
    text: 'Portion size often matters more than the food itself. Serving food on a smaller plate and putting the rest away before you start makes seconds a choice.',
    tags: ['over-budget', 'high-energy-density'],
  },
  {
    id: 'portion-hand',
    title: 'Use your hand as a guide',
    text: 'Your hand is a handy guide. A palm of protein, a fist of grains or starch, and two fists of vegetables make a balanced plate.',
    tags: ['over-budget', 'low-protein'],
  },
  {
    id: 'budget-day',
    title: 'One meal does not decide the day',
    text: 'One bigger meal does not undo your progress. Go a little lighter at the next meal, add a walk if you like, and carry on as normal.',
    tags: ['over-budget'],
  },
  {
    id: 'budget-plan',
    title: 'Plan the rest of the day',
    text: 'Look at what is left in your day and plan around it. Filling the next meal with protein and vegetables is an easy way to stay near your target.',
    tags: ['over-budget', 'high-energy-density'],
  },
  {
    id: 'budget-restaurant',
    title: 'Restaurant portions run large',
    text: 'Restaurant portions are often big. Sharing a dish, taking half home, or choosing a starter as your main can keep a meal in range.',
    tags: ['over-budget', 'high-energy-density'],
  },

  /* ---------- light meals and skipping ---------- */
  {
    id: 'meals-skipping',
    title: 'Skipping meals can backfire',
    text: 'Skipping meals can leave you very hungry later, which makes big portions more likely. Regular meals with protein usually feel easier to keep up.',
    tags: ['light-meal'],
  },
  {
    id: 'meals-light-balance',
    title: 'A light meal can be a good choice',
    text: 'A light meal can be a fine choice if you stay satisfied. Add a protein or a fiber-rich side if you expect to be hungry again within an hour or two.',
    tags: ['light-meal', 'low-protein', 'low-fiber'],
  },
  {
    id: 'meals-snack-plan',
    title: 'Plan a snack for the gap',
    text: 'If your next meal is a long way off, plan a small snack. A piece of fruit with some nuts or yogurt keeps you steady without a big swing.',
    tags: ['light-meal'],
  },

  /* ---------- allergens ---------- */
  {
    id: 'allergen-labels',
    title: 'Check labels and ask',
    text: 'Always check ingredient labels and ask about ingredients when you eat out. Recipes and brands change, so a food that was fine before may not be now.',
    tags: ['allergen'],
  },
  {
    id: 'allergen-crosscontact',
    title: 'Cross-contact can happen',
    text: 'Foods can pick up traces of allergens from shared equipment or kitchens. If you have a serious allergy, tell the cook and follow the advice of your own doctor or allergist.',
    tags: ['allergen'],
  },
  {
    id: 'allergen-estimates',
    title: 'Photo estimates can miss ingredients',
    text: 'A photo or a short description cannot show every ingredient. Use the allergen notes here as a reminder to double-check the ingredients yourself.',
    tags: ['allergen'],
  },

  /* ---------- general habits (no flag) ---------- */
  {
    id: 'habit-slow',
    title: 'Eat slowly',
    text: 'Eating slowly gives your body time to notice fullness. Put your fork down between bites and aim to make the meal last at least twenty minutes.',
    tags: [],
  },
  {
    id: 'habit-water',
    title: 'Drink water through the day',
    text: 'Sipping water through the day helps, and thirst can feel like hunger. A glass before a meal is an easy habit to try.',
    tags: [],
  },
  {
    id: 'habit-sleep',
    title: 'Sleep supports your plan',
    text: 'Short sleep tends to raise hunger and cravings. A steady bedtime is a quiet way to make healthy choices easier.',
    tags: [],
  },
  {
    id: 'habit-consistency',
    title: 'Consistency beats perfection',
    text: 'Steady habits matter more than perfect days. Aim for most meals to land near your plan and let the rest be flexible.',
    tags: [],
  },
  {
    id: 'habit-mindful',
    title: 'Eat without screens when you can',
    text: 'Eating without a screen helps you notice flavor and fullness. Even one screen-free meal a day is a good start.',
    tags: [],
  },
  {
    id: 'habit-cook-home',
    title: 'Cooking at home gives you control',
    text: 'Cooking at home lets you decide on oil, salt and portions. Simple meals with a protein, a vegetable and a grain are enough.',
    tags: [],
  },
  {
    id: 'habit-walk',
    title: 'A short walk after meals',
    text: 'A ten-minute walk after a meal is an easy way to add movement. It also helps many people feel more comfortable after eating.',
    tags: [],
  },
];
