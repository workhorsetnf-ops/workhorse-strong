// Group nutrition (Update 181): the written guide group members read under Eat,
// and the starter meal plan template that scales to each member's macros.
// The coach can rewrite the guide from the Group page; until then this default
// is what members see.

export const GUIDE_TITLE = 'The Workhorse Nutrition Guide'

export const DEFAULT_GUIDE = `## Your numbers

When you signed up, the app set your calories and macros from your weight, height, age, goal and how much you wrestle. It's the same method used for 1-on-1 clients:

- **Protein:** about 1 g per pound of bodyweight. This is the number that matters most.
- **Fat:** enough to keep hormones and energy where they should be. Never below 40 g a day.
- **Carbs:** everything else. Carbs are your fuel for training and shows.
- **Calories:** about 500 under maintenance to lose fat, or about 300 over to build.

Your targets are on Home and in the Eat tab. You don't have to be perfect. You have to be consistent.

## The daily standard

1. **Hit your protein.** Within 10 g either way, every day.
2. **Land your calories.** Within about 100 either way. Carbs and fat can move around inside that.
3. **Log everything, the same day.** Bites, sauces, drinks. If you didn't log it, you can't learn from it.
4. **Weigh your food cooked.** Meat, rice and potatoes are listed as cooked weights. A $10 food scale is the best money you'll spend this year.
5. **Get your steps.** Movement outside the gym is the easiest lever you have.

## How to use your meal plan

Your meal plan (Eat → Meal plan) is already sized to your numbers. Eat it as written and you hit your macros without thinking.

- **It's a template, not a prison.** Each meal has a swap line under it. Swap like for like: one protein for another, one carb for another.
- **One tap logs a whole meal** from the Eat tab. Change the grams if you ate a little more or less.
- **Repeat meals.** The people who get results eat the same few meals most days. Boring works.
- **Prep twice a week.** Cook your proteins and carbs in bulk on Sunday and Wednesday.

## Reading the scale

- Weigh in every morning: after the bathroom, before food and water.
- **Only the weekly average matters.** Daily weight swings 2 to 5 lb with salt, carbs, water, travel and shows.
- After a show or a long drive, expect a spike. It's water. Keep going.
- Losing fat? Aim for about 0.5 to 1% of bodyweight a week. Building? About 0.25 to 0.5%.

## When to adjust

The app does this for you. Look for the **macro check** card at the top of the Eat tab.

- **Your first check comes three weeks after you join:** one week to set your starting average, then two weeks to compare. After any change, the next check is two full weeks later.
- **You need at least 6 of 7 days logged, both weeks,** and at least 4 weigh-ins a week. Logged less? Nothing changes yet. Tighten up first. You can't fix what you didn't track.
- **Cutting and your weekly average dropped less than 0.5% in two weeks?** The card offers to take 30 g of carbs off (120 calories). Tap Apply and your targets and meal plan update.
- **Building and it rose less than 0.25%?** The card offers to add 30 g of carbs.
- **Moving at the right pace?** Nothing changes. Keep going.
- **Protein and fat never change,** and carbs never go under 100 g. If you're cutting and already near that, the card tells you to message Coach.

## Training days and show days

- **Eat 2 to 3 hours before you train or wrestle:** protein plus easy carbs (rice, potatoes, oats, fruit, a bagel).
- **Tight on time?** A banana or rice cakes 30 to 60 minutes before is enough.
- **After the show,** get a real protein meal in. Don't let the post-show meal be the gas station hot dog roller.
- **Hydrate all day,** not just at the building. Add salt if you sweat heavily or it's hot.

## On the road

You don't need perfect food. You need a plan. Good default orders:

- **Chipotle:** bowl, double chicken, white rice, black beans, fajita veggies, salsa, light guac.
- **Gas station:** protein shake (Fairlife, Premier), beef jerky, a banana, Greek yogurt, string cheese.
- **Fast food:** grilled chicken sandwich or nuggets, a side salad or fruit, diet drink. Skip the fries most of the time.
- **Breakfast spot:** eggs or egg whites, toast or potatoes, fruit.
- **Hotel:** pack shakers and protein powder, rice cakes, oats packets and jerky in your bag.

Log your best guess. A rough log beats no log every time.

## Eating out and alcohol

- **Order protein first,** then build the plate around it.
- **Ask for sauces on the side.** Cooking oil and butter are where restaurant calories hide.
- **Alcohol counts.** If you drink, fit it into your carbs and fat for the day and keep protein where it is. Fewer drinks, less often, is the only real advice.

## Supplements that are worth it

- **Creatine monohydrate:** 3 to 5 g every day. Timing doesn't matter.
- **Whey or a protein shake:** only to make hitting protein easier.
- **Caffeine:** before training if you like it. Not within about 8 hours of bed.

That's the list. Everything else is optional at best.

## Standards over feelings

You won't feel like logging every day. Do it anyway. Keep the promises you make to yourself and the results take care of themselves.`

// Starter meal plan for group members, written at 200 P / 280 C / 70 F (a
// 200 lb wrestler cutting). The app scales every portion to each member's own
// macros when they join, so one template fits everyone. Swap lines avoid fixed
// grams so they stay right after scaling.
const food = (food_name, category, grams, p, c, f, fi, note = '') => ({ food_name, category, grams, protein100: p, carbs100: c, fat100: f, fiber100: fi, note })

export const STARTER_GROUP_PLAN_NAME = 'Group starter plan (scales to each member)'
export const STARTER_GROUP_PLAN = {
  fiber_target: 35,
  notes: '',
  meals: [
    { label: 'Breakfast', position: 0,
      swap: 'Swap: oats for cream of rice (same weight) or a plain bagel. On the road: 2 egg sandwiches on English muffins + a protein shake.',
      items: [
        food('Oats (dry)', 'Carb', 70, 13.2, 67.7, 6.5, 10.1, 'Weigh dry, then cook'),
        food('Whey Protein', 'Protein', 30, 80, 8, 6, 0, 'Stir into the oats after cooking'),
        food('Banana', 'Fruit', 100, 1.1, 22.8, 0.3, 2.6),
        food('Whole Eggs', 'Protein', 100, 12.6, 0.7, 9.5, 0, 'About 2 large eggs'),
      ] },
    { label: 'Lunch', position: 1,
      swap: 'Swap: chicken for steak, shrimp, tuna or 93/7 beef (same weight). On the road: Chipotle bowl, double chicken, white rice, black beans, fajita veggies, salsa, light guac.',
      items: [
        food('Chicken Breast (cooked)', 'Protein', 160, 31, 0, 3.6, 0, 'Weigh after cooking'),
        food('White Rice (cooked)', 'Carb', 220, 2.7, 28.2, 0.3, 0.4),
        food('Black Beans (cooked)', 'Carb', 80, 8.9, 23.7, 0.5, 8.7),
        food('Salsa', 'Veg', 60, 1.5, 6.6, 0.2, 1.8),
        food('Avocado', 'Fat', 70, 2, 8.5, 14.7, 6.7),
      ] },
    { label: 'Snack', position: 2,
      swap: 'Swap: Greek yogurt for cottage cheese (same weight), or a protein shake + a piece of fruit. Gas station: protein shake + banana + beef jerky.',
      items: [
        food('Greek Yogurt (nonfat)', 'Dairy', 250, 10.3, 3.6, 0.4, 0),
        food('Granola', 'Carb', 30, 9, 64, 14, 6),
        food('Blueberries', 'Fruit', 100, 0.7, 14.5, 0.3, 2.4, 'Fresh or frozen'),
      ] },
    { label: 'Dinner', position: 3,
      swap: 'Swap: beef for chicken thighs, sirloin or salmon (use a little less salmon). Potatoes for rice (3/4 of the weight) or pasta (2/3 of the weight). On the road: grilled chicken or steak plate with a baked potato and vegetables.',
      items: [
        food('93/7 Ground Beef (cooked)', 'Protein', 170, 27, 0, 8.6, 0, 'Weigh after cooking'),
        food('Potato (baked)', 'Carb', 270, 2.5, 21.2, 0.1, 2.2),
        food('Mixed Vegetables', 'Veg', 150, 2.6, 13, 0.2, 4.4),
        food('Olive Oil', 'Fat', 15, 0, 0, 100, 0, 'For cooking'),
      ] },
  ],
}
STARTER_GROUP_PLAN.meals.forEach(m => m.items.forEach((it, i) => { it.position = i }))
