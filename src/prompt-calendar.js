// Curated weeks, starting at Eastern midnight on this date. Append weeks rather
// than inserting/reordering published entries: each index belongs to a date.
export const CALENDAR_START = '2026-10-10';
export const PROMPT_WEEKS = [
  ['a frog wearing its favorite boots', 'two clouds having an argument', 'Snoopy taking a nap', 'a chair made of jelly', 'three carrots dancing together', 'a tiny castle', 'Saturn missing a ring'],
  ['a very, very long cat', 'a suspicious-looking sandwich', 'Pikachu discovering a balloon', 'a volcano settling down to sleep', 'a whale folded from paper', 'three mushrooms posing for a photo', 'the Eiffel Tower wearing a bow tie'],
  ['a house on wheels', 'a shy strawberry', 'Kirby carrying an umbrella', 'a duck packed for an adventure', 'a clock melting in the heat', 'the most dramatic flower', 'Santa enjoying a beach day'],
  ['a button bigger than a house', 'a penguin trying on sunhats', 'Pac-Man taking a bite of pizza', 'a mountain made of fluff', 'two socks reunited at last', 'a candle fighting the wind', 'Earth wrapped in a scarf'],
  ['a pineapple falling asleep', 'a robot that loves gardening', 'SpongeBob blowing a giant bubble', 'a dog made of spaghetti', 'a mailbox full of good news', 'two snails having a race', 'the Statue of Liberty holding an ice cream'],
  ['a lighthouse with a slight lean', 'an entire planet of ice cream', 'Batman wearing a cape that’s too long', 'a mouse with enormous ears', 'a bathtub floating through the sky', 'two cacti trying to hug', 'a birthday cake for Godzilla'],
  ['a cheerful umbrella', 'a turtle dressed for winter', 'Mario taking a coffee break', 'a sofa made of clouds', 'two cherries sharing a secret', 'a teapot on tiny legs', 'the Moon wearing earmuffs'],
  ['a pear with a magnificent mustache', 'a sleepy little train', 'Winnie the Pooh holding an empty honey pot', 'three stars playing tag', 'a shoe that wants to be a boat', 'a tree with a curly trunk', 'Big Ben wearing a scarf'],
  ['a crab learning to wave', 'a toast-shaped house', 'Hello Kitty wearing rain boots', 'two pencils taking a bow', 'a snowman with a crooked smile', 'a very bouncy pumpkin', 'Mars wearing sunglasses'],
  ['a tiny dragon with a big yawn', 'a lampshade made of leaves', 'Garfield waiting for dinner', 'three pebbles stacked proudly', 'a fish with a fancy tail', 'a kettle that sings', 'the Leaning Tower of Pisa standing straight'],
  ['a mitten waving hello', 'a sleepy crescent moon', 'Olaf melting a little', 'two penguins sliding together', 'a cupcake with a towering swirl', 'a house made of pillows', 'Rudolph with an extra-bright nose'],
  ['a balloon shaped like a rabbit', 'a happy little fireplace', 'Snoopy wrapped in a blanket', 'two candles celebrating together', 'a snail carrying a gift', 'a star with stage fright', 'Santa wearing enormous slippers'],
  ['a hat full of confetti', 'a dog with a curly mustache', 'Kirby making a wish', 'three flowers welcoming the sun', 'a pocket-sized mountain', 'a clock with sleepy eyes', 'Earth wearing a party hat'],
  ['a fox in fuzzy socks', 'a mug that loves hot chocolate', 'Pikachu with bed hair', 'two snowballs meeting for the first time', 'a bridge made of spaghetti', 'a floating slice of watermelon', 'the Eiffel Tower on tiptoe'],
  ['a seal balancing a tiny hat', 'a book with little feet', 'Pac-Man wearing a crown', 'three raindrops racing', 'a lemon that looks surprised', 'a chair fit for a mouse', 'Saturn wearing a flower crown'],
  ['a sleepy crocodile', 'a cloud made of popcorn', 'SpongeBob wearing a bow tie', 'two spoons having a dance', 'a rose with very big leaves', 'a suitcase ready for a holiday', 'the Statue of Liberty wearing mittens'],
  ['a very round horse', 'a jellybean spaceship', 'Batman holding a tiny umbrella', 'two hearts leaning on each other', 'a teacup with enormous handles', 'a mushroom that thinks it is a tree', 'the Moon taking a nap'],
  ['a hedgehog with a soft side', 'a house made of ice', 'Winnie the Pooh wearing a sunhat', 'three buttons in a marching band', 'a noodle with a knot in it', 'an excited little watering can', 'Godzilla wearing a party hat'],
  ['a sleepy bumblebee', 'a lamp shaped like a tulip', 'Mario carrying an oversized mushroom', 'two leaves drifting together', 'a very tall sandwich', 'a kite with a tangled tail', 'Big Ben taking a nap'],
  ['a duck wearing a crown', 'a pancake with a happy face', 'Hello Kitty holding a daisy', 'three snails waiting in line', 'a little boat with a huge sail', 'a cactus made of jelly', 'Mars wearing a woolly hat'],
  ['a rabbit with one floppy ear', 'a cloud that looks like a fish', 'Garfield in a very small box', 'two boots splashing together', 'a strawberry-shaped teapot', 'a tiny door in a tree', 'the Leaning Tower of Pisa wearing a hat'],
  ['a proud little caterpillar', 'a castle made of sand', 'Snoopy smelling a flower', 'three peas having a meeting', 'a toothbrush with wild hair', 'a sleepy rainbow', 'Earth holding a flower'],
  ['a whale wearing a scarf', 'a doughnut with a square hole', 'Kirby balancing on one foot', 'two mushrooms sheltering from the rain', 'a robot made of cardboard', 'a flower growing from a boot', 'Saturn with a striped ring'],
  ['a tiny octopus with a big hat', 'a cheerful windmill', 'Pikachu holding a pinwheel', 'two apples trying not to laugh', 'a chair with very long legs', 'a fluffy little spaceship', 'the Eiffel Tower made of candy'],
  ['a cat shaped like a loaf of bread', 'a very fancy feather', 'Pac-Man blowing a bubble', 'three clouds in a parade', 'a clock with a mustache', 'a sleepy garden gnome', 'the Statue of Liberty holding a balloon'],
  ['a frog enjoying a cup of tea', 'a house with a huge chimney', 'SpongeBob flying a kite', 'two snails celebrating a finish', 'a moon made of cheese', 'a flower that loves to dance', 'a tiny crown for Godzilla'],
];
export const DAILY_PROMPTS = PROMPT_WEEKS.flat();
