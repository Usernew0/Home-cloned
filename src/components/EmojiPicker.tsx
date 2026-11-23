import React, { useState, useMemo } from 'react';
import { Search, X, Heart, Smile, Sparkles, Coffee, Trophy, Compass, Flag } from 'lucide-react';

interface EmojiItem {
  char: string;
  name: string;
  keywords: string[];
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  emojis: EmojiItem[];
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const emojiDataset: EmojiCategory[] = [
  {
    id: 'love',
    name: 'Romance & Hearts',
    icon: <Heart className="w-4 h-4 text-rose-500 animate-pulse" />,
    emojis: [
      { char: '❤️', name: 'Red Heart', keywords: ['love', 'heart', 'romance', 'red'] },
      { char: '💖', name: 'Sparkling Heart', keywords: ['love', 'heart', 'sparkle', 'pink'] },
      { char: '🥰', name: 'Smiling Face with Hearts', keywords: ['love', 'happy', 'blush', 'affection'] },
      { char: '😘', name: 'Face Blowing a Kiss', keywords: ['love', 'kiss', 'blow', 'affection'] },
      { char: '😍', name: 'Smiling Face with Heart-Eyes', keywords: ['love', 'heart', 'eyes', 'crush'] },
      { char: '💕', name: 'Two Hearts', keywords: ['love', 'hearts', 'pink', 'friendship'] },
      { char: '💗', name: 'Growing Heart', keywords: ['love', 'heart', 'pink', 'growing'] },
      { char: '💓', name: 'Beating Heart', keywords: ['love', 'heart', 'pink', 'beat'] },
      { char: '💞', name: 'Revolving Hearts', keywords: ['love', 'hearts', 'pink', 'spin'] },
      { char: '💟', name: 'Heart Decoration', keywords: ['love', 'heart', 'purple'] },
      { char: '❣️', name: 'Heart Exclamation', keywords: ['love', 'heart', 'exclamation', 'red'] },
      { char: '💌', name: 'Love Letter', keywords: ['love', 'letter', 'mail', 'envelope'] },
      { char: '💋', name: 'Kiss Mark', keywords: ['love', 'kiss', 'lips', 'makeup'] },
      { char: '💏', name: 'Kiss', keywords: ['love', 'kiss', 'couple', 'romance'] },
      { char: '💑', name: 'Couple with Heart', keywords: ['love', 'couple', 'heart', 'relationship'] },
      { char: '🌹', name: 'Rose', keywords: ['love', 'flower', 'romance', 'rose'] },
      { char: '🌸', name: 'Cherry Blossom', keywords: ['flower', 'cherry', 'blossom', 'spring'] },
      { char: '💐', name: 'Bouquet', keywords: ['flower', 'bouquet', 'gift', 'romance'] },
      { char: '💍', name: 'Ring', keywords: ['love', 'ring', 'jewelry', 'marriage', 'proposal'] },
      { char: '🧸', name: 'Teddy Bear', keywords: ['toy', 'bear', 'cute', 'gift'] },
      { char: '💝', name: 'Heart with Ribbon', keywords: ['love', 'heart', 'gift', 'ribbon'] },
      { char: '💘', name: 'Heart with Arrow', keywords: ['love', 'heart', 'arrow', 'cupid'] },
      { char: '🤍', name: 'White Heart', keywords: ['love', 'heart', 'white'] },
      { char: '🤎', name: 'Brown Heart', keywords: ['love', 'heart', 'brown'] },
      { char: '🖤', name: 'Black Heart', keywords: ['love', 'heart', 'black', 'goth'] },
      { char: '💜', name: 'Purple Heart', keywords: ['love', 'heart', 'purple'] },
      { char: '💙', name: 'Blue Heart', keywords: ['love', 'heart', 'blue'] },
      { char: '💚', name: 'Green Heart', keywords: ['love', 'heart', 'green'] },
      { char: '💛', name: 'Yellow Heart', keywords: ['love', 'heart', 'yellow'] },
      { char: '🧡', name: 'Orange Heart', keywords: ['love', 'heart', 'orange'] },
      { char: '🎁', name: 'Wrapped Gift', keywords: ['gift', 'present', 'birthday', 'surprise'] },
      { char: '🎈', name: 'Balloon', keywords: ['balloon', 'party', 'celebration'] },
      { char: '✨', name: 'Sparkles', keywords: ['sparkle', 'magic', 'shine', 'glow'] },
      { char: '🔥', name: 'Fire', keywords: ['fire', 'hot', 'lit', 'flame'] }
    ]
  },
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: <Smile className="w-4 h-4 text-amber-500" />,
    emojis: [
      { char: '😀', name: 'Grinning Face', keywords: ['happy', 'smile', 'grin', 'smiley'] },
      { char: '😃', name: 'Grinning Face with Big Eyes', keywords: ['happy', 'smile', 'grin', 'excited'] },
      { char: '😄', name: 'Grinning Face with Smiling Eyes', keywords: ['happy', 'smile', 'grin', 'joy'] },
      { char: '😁', name: 'Beaming Face with Smiling Eyes', keywords: ['happy', 'smile', 'grin', 'beaming'] },
      { char: '😆', name: 'Grinning Squinting Face', keywords: ['happy', 'smile', 'laugh', 'squint'] },
      { char: '😅', name: 'Grinning Face with Sweat', keywords: ['happy', 'smile', 'sweat', 'relief'] },
      { char: '😂', name: 'Face with Tears of Joy', keywords: ['happy', 'laugh', 'tears', 'joy', 'lol'] },
      { char: '🤣', name: 'Rolling on the Floor Laughing', keywords: ['happy', 'laugh', 'rofl', 'lol'] },
      { char: '😊', name: 'Smiling Face with Smiling Eyes', keywords: ['happy', 'smile', 'blush', 'warm'] },
      { char: '😇', name: 'Smiling Face with Halo', keywords: ['happy', 'angel', 'innocent', 'halo'] },
      { char: '🙂', name: 'Slightly Smiling Face', keywords: ['happy', 'smile', 'slight'] },
      { char: '🙃', name: 'Upside-Down Face', keywords: ['silly', 'sarcastic', 'flip'] },
      { char: '😉', name: 'Winking Face', keywords: ['wink', 'flirt', 'playful'] },
      { char: '😌', name: 'Relieved Face', keywords: ['calm', 'peace', 'relieved', 'content'] },
      { char: '😋', name: 'Face Savoring Food', keywords: ['yummy', 'delicious', 'tongue', 'hungry'] },
      { char: '😛', name: 'Face with Tongue', keywords: ['tongue', 'playful', 'silly'] },
      { char: '😜', name: 'Winking Face with Tongue', keywords: ['tongue', 'wink', 'silly', 'playful'] },
      { char: '🤪', name: 'Zany Face', keywords: ['crazy', 'silly', 'fun', 'zany'] },
      { char: '😝', name: 'Squinting Face with Tongue', keywords: ['tongue', 'squint', 'silly'] },
      { char: '🤑', name: 'Money-Mouth Face', keywords: ['money', 'rich', 'wealth'] },
      { char: '🤗', name: 'Hugging Face', keywords: ['hug', 'warm', 'friendly'] },
      { char: '🤭', name: 'Face with Hand Over Mouth', keywords: ['gasp', 'giggle', 'shame', 'oops'] },
      { char: '🤫', name: 'Shushing Face', keywords: ['quiet', 'shh', 'secret'] },
      { char: '🤔', name: 'Thinking Face', keywords: ['think', 'ponder', 'hmm'] },
      { char: '🤐', name: 'Zipper-Mouth Face', keywords: ['quiet', 'zip', 'secret'] },
      { char: '🤨', name: 'Face with Raised Eyebrow', keywords: ['suspicious', 'skeptical', 'hmm'] },
      { char: '😐', name: 'Neutral Face', keywords: ['neutral', 'okay', 'meh'] },
      { char: '😑', name: 'Expressionless Face', keywords: ['expressionless', 'meh', 'flat'] },
      { char: '😶', name: 'Face Without Mouth', keywords: ['silent', 'quiet', 'speechless'] },
      { char: '😏', name: 'Smirking Face', keywords: ['smirk', 'cool', 'flirt', 'sly'] },
      { char: '😒', name: 'Unamused Face', keywords: ['bored', 'unhappy', 'meh', 'unamused'] },
      { char: '🙄', name: 'Face with Rolling Eyes', keywords: ['roll', 'eyes', 'bored', 'annoyed'] },
      { char: '😬', name: 'Grimacing Face', keywords: ['grimace', 'awkward', 'eek'] },
      { char: '🤥', name: 'Lying Face', keywords: ['liar', 'pinocchio', 'lie'] },
      { char: '😔', name: 'Pensive Face', keywords: ['sad', 'pensive', 'sorry'] },
      { char: '😪', name: 'Sleepy Face', keywords: ['sleep', 'tired', 'bubble'] },
      { char: '🤤', name: 'Drooling Face', keywords: ['drool', 'hungry', 'yummy'] },
      { char: '😴', name: 'Sleeping Face', keywords: ['sleep', 'zzz', 'tired'] },
      { char: '😷', name: 'Face with Medical Mask', keywords: ['sick', 'mask', 'doctor', 'covid'] },
      { char: '🤒', name: 'Face with Thermometer', keywords: ['sick', 'fever', 'cold'] },
      { char: '🤕', name: 'Face with Head-Bandage', keywords: ['hurt', 'bandage', 'injury'] },
      { char: '🤢', name: 'Nauseated Face', keywords: ['sick', 'disgust', 'green', 'vomit'] },
      { char: '🤮', name: 'Face Vomiting', keywords: ['sick', 'puke', 'vomit'] },
      { char: '🥵', name: 'Hot Face', keywords: ['hot', 'sun', 'sweat', 'summer'] },
      { char: '🥶', name: 'Cold Face', keywords: ['cold', 'winter', 'ice', 'freeze'] },
      { char: '🥴', name: 'Woozy Face', keywords: ['dizzy', 'drunk', 'woozy'] },
      { char: '😵', name: 'Face with Crossed Eyes', keywords: ['dizzy', 'dead', 'crossed'] },
      { char: '🤯', name: 'Exploding Head', keywords: ['mindblown', 'wow', 'crazy', 'explode'] },
      { char: '🤠', name: 'Cowboy Hat Face', keywords: ['cowboy', 'hat', 'yeehaw'] },
      { char: '🥳', name: 'Partying Face', keywords: ['party', 'celebrate', 'horn', 'happy'] },
      { char: '😎', name: 'Smiling Face with Sunglasses', keywords: ['cool', 'sunglasses', 'swag'] },
      { char: '🤓', name: 'Nerd Face', keywords: ['nerd', 'geek', 'glasses', 'smart'] },
      { char: '🧐', name: 'Face with Monocle', keywords: ['fancy', 'monocle', 'inspect'] },
      { char: '😕', name: 'Confused Face', keywords: ['confused', 'hmm', 'puzzled'] },
      { char: '😟', name: 'Worried Face', keywords: ['worried', 'nervous', 'scared'] },
      { char: '🙁', name: 'Slightly Frowning Face', keywords: ['sad', 'frown', 'slight'] },
      { char: '😮', name: 'Face with Open Mouth', keywords: ['gasp', 'surprise', 'wow'] },
      { char: '😯', name: 'Hushed Face', keywords: ['quiet', 'surprise', 'hushed'] },
      { char: '😲', name: 'Astonished Face', keywords: ['shock', 'surprise', 'wow'] },
      { char: '😳', name: 'Flushed Face', keywords: ['blush', 'embarrassed', 'shy'] },
      { char: '🥺', name: 'Pleading Face', keywords: ['please', 'puppy', 'eyes', 'beg'] },
      { char: '😢', name: 'Crying Face', keywords: ['sad', 'cry', 'tear'] },
      { char: '😭', name: 'Loudly Crying Face', keywords: ['sad', 'cry', 'sob', 'tear', 'crying'] },
      { char: '😱', name: 'Face Screaming in Fear', keywords: ['fear', 'scared', 'scream', 'shock'] },
      { char: '😖', name: 'Confounded Face', keywords: ['angry', 'frustrated', 'ouch'] },
      { char: '🥱', name: 'Yawning Face', keywords: ['tired', 'yawn', 'sleep'] },
      { char: '😤', name: 'Face with Steam From Nose', keywords: ['angry', 'triumph', 'proud', 'mad'] },
      { char: '😡', name: 'Pouting Face', keywords: ['angry', 'mad', 'pout', 'red'] },
      { char: '😠', name: 'Angry Face', keywords: ['angry', 'mad', 'annoyed'] },
      { char: '🤬', name: 'Face with Symbols on Mouth', keywords: ['swear', 'cuss', 'angry', 'mad'] },
      { char: '😈', name: 'Smiling Face with Horns', keywords: ['devil', 'horns', 'evil', 'mischievous'] },
      { char: '👿', name: 'Angry Face with Horns', keywords: ['devil', 'horns', 'angry', 'evil'] },
      { char: '💀', name: 'Skull', keywords: ['dead', 'skull', 'goth', 'halloween'] },
      { char: '☠️', name: 'Skull and Crossbones', keywords: ['danger', 'pirate', 'poison'] },
      { char: '💩', name: 'Pile of Poop', keywords: ['poop', 'funny', 'sh**'] },
      { char: '🤡', name: 'Clown Face', keywords: ['clown', 'circus', 'funny'] },
      { char: '👻', name: 'Ghost', keywords: ['ghost', 'spooky', 'halloween'] },
      { char: '👽', name: 'Alien', keywords: ['alien', 'ufo', 'space'] },
      { char: '👾', name: 'Alien Monster', keywords: ['game', 'retro', 'monster', 'space'] },
      { char: '🤖', name: 'Robot', keywords: ['robot', 'bot', 'tech'] }
    ]
  },
  {
    id: 'gestures',
    name: 'Gestures & Body',
    icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
    emojis: [
      { char: '👍', name: 'Thumbs Up', keywords: ['thumbsup', 'good', 'agree', 'yes', 'ok'] },
      { char: '👎', name: 'Thumbs Down', keywords: ['thumbsdown', 'bad', 'disagree', 'no'] },
      { char: '👊', name: 'Oncoming Fist', keywords: ['punch', 'fist', 'attack'] },
      { char: '✊', name: 'Raised Fist', keywords: ['fist', 'power', 'solidarity'] },
      { char: '🤛', name: 'Left-Facing Fist', keywords: ['fist', 'left', 'bump'] },
      { char: '🤜', name: 'Right-Facing Fist', keywords: ['fist', 'right', 'bump'] },
      { char: '🤞', name: 'Crossed Fingers', keywords: ['luck', 'promise', 'hope'] },
      { char: '✌️', name: 'Victory Hand', keywords: ['victory', 'peace', 'sign'] },
      { char: '🤟', name: 'Love-You Gesture', keywords: ['love', 'sign', 'ily'] },
      { char: '🤘', name: 'Sign of the Horns', keywords: ['rock', 'horns', 'metal'] },
      { char: '👌', name: 'OK Hand', keywords: ['ok', 'fine', 'good'] },
      { char: '🤌', name: 'Pinched Fingers', keywords: ['italian', 'sarcasm', 'question'] },
      { char: '👈', name: 'Backhand Index Pointing Left', keywords: ['point', 'left', 'direction'] },
      { char: '👉', name: 'Backhand Index Pointing Right', keywords: ['point', 'right', 'direction'] },
      { char: '👆', name: 'Backhand Index Pointing Up', keywords: ['point', 'up', 'direction'] },
      { char: '👇', name: 'Backhand Index Pointing Down', keywords: ['point', 'down', 'direction'] },
      { char: '☝️', name: 'Index Pointing Up', keywords: ['point', 'up', 'number'] },
      { char: '✋', name: 'Raised Hand', keywords: ['stop', 'highfive', 'hand'] },
      { char: '🤚', name: 'Raised Back of Hand', keywords: ['hand', 'back'] },
      { char: '🖐️', name: 'Hand with Fingers Splayed', keywords: ['hand', 'five'] },
      { char: '🖖', name: 'Vulcan Salute', keywords: ['spock', 'startrek', 'salute'] },
      { char: '👋', name: 'Waving Hand', keywords: ['wave', 'hello', 'bye', 'greet'] },
      { char: '🤙', name: 'Call Me Hand', keywords: ['call', 'phone', 'hangloose'] },
      { char: '💪', name: 'Flexed Biceps', keywords: ['muscle', 'strong', 'flex', 'power'] },
      { char: '🙏', name: 'Folded Hands', keywords: ['please', 'thankyou', 'pray', 'namaste'] },
      { char: '👏', name: 'Clapping Hands', keywords: ['clap', 'applause', 'good'] },
      { char: '🙌', name: 'Raising Hands', keywords: ['celebrate', 'hooray', 'praise'] },
      { char: '👐', name: 'Open Hands', keywords: ['hands', 'open', 'hug'] },
      { char: '🤝', name: 'Handshake', keywords: ['deal', 'handshake', 'agree', 'meet'] },
      { char: '✍️', name: 'Writing Hand', keywords: ['write', 'pen', 'draw'] },
      { char: '💅', name: 'Nail Polish', keywords: ['makeup', 'nails', 'glam', 'sass'] },
      { char: '🤳', name: 'Selfie', keywords: ['camera', 'selfie', 'phone'] },
      { char: '🧠', name: 'Brain', keywords: ['brain', 'smart', 'think', 'mind'] },
      { char: '🦷', name: 'Tooth', keywords: ['tooth', 'dentist', 'teeth'] },
      { char: '🗣️', name: 'Speaking Head', keywords: ['speak', 'talk', 'voice'] },
      { char: '👤', name: 'Bust in Silhouette', keywords: ['user', 'person', 'shadow'] },
      { char: '👥', name: 'Busts in Silhouette', keywords: ['users', 'people', 'shadow'] }
    ]
  },
  {
    id: 'nature',
    name: 'Animals & Nature',
    icon: <Compass className="w-4 h-4 text-cyan-400" />,
    emojis: [
      { char: '🐶', name: 'Dog Face', keywords: ['dog', 'puppy', 'pet', 'animal'] },
      { char: '🐱', name: 'Cat Face', keywords: ['cat', 'kitty', 'pet', 'animal'] },
      { char: '🐭', name: 'Mouse Face', keywords: ['mouse', 'rodent', 'animal'] },
      { char: '🐹', name: 'Hamster Face', keywords: ['hamster', 'pet', 'animal'] },
      { char: '🐰', name: 'Rabbit Face', keywords: ['bunny', 'rabbit', 'animal'] },
      { char: '🦊', name: 'Fox', keywords: ['fox', 'animal', 'wild'] },
      { char: '🐻', name: 'Bear', keywords: ['bear', 'animal', 'wild'] },
      { char: '🐼', name: 'Panda', keywords: ['panda', 'animal', 'cute'] },
      { char: '🐨', name: 'Koala', keywords: ['koala', 'animal', 'cute'] },
      { char: '🐯', name: 'Tiger Face', keywords: ['tiger', 'cat', 'wild'] },
      { char: '🦁', name: 'Lion', keywords: ['lion', 'cat', 'wild', 'king'] },
      { char: '🐮', name: 'Cow Face', keywords: ['cow', 'farm', 'animal'] },
      { char: '🐷', name: 'Pig Face', keywords: ['pig', 'farm', 'animal'] },
      { char: '🐸', name: 'Frog', keywords: ['frog', 'amphibian', 'animal'] },
      { char: '🐵', name: 'Monkey Face', keywords: ['monkey', 'animal', 'cute'] },
      { char: '🐔', name: 'Chicken', keywords: ['chicken', 'bird', 'farm'] },
      { char: '🐧', name: 'Penguin', keywords: ['penguin', 'bird', 'cold'] },
      { char: '🐦', name: 'Bird', keywords: ['bird', 'fly', 'animal'] },
      { char: '🐤', name: 'Baby Chick', keywords: ['bird', 'chicken', 'cute'] },
      { char: '🦆', name: 'Duck', keywords: ['duck', 'bird', 'pond'] },
      { char: '🦅', name: 'Eagle', keywords: ['eagle', 'bird', 'wild'] },
      { char: '🦉', name: 'Owl', keywords: ['owl', 'bird', 'wise'] },
      { char: '🦋', name: 'Butterfly', keywords: ['butterfly', 'insect', 'wings'] },
      { char: '🐝', name: 'Honeybee', keywords: ['bee', 'bug', 'honey', 'sweet'] },
      { char: '🐞', name: 'Lady Beetle', keywords: ['ladybug', 'bug', 'red'] },
      { char: '🕷️', name: 'Spider', keywords: ['spider', 'bug', 'spooky'] },
      { char: '🐙', name: 'Octopus', keywords: ['octopus', 'sea', 'ocean'] },
      { char: '🐠', name: 'Tropical Fish', keywords: ['fish', 'sea', 'ocean', 'aquarium'] },
      { char: '🐬', name: 'Dolphin', keywords: ['dolphin', 'sea', 'ocean', 'smart'] },
      { char: '🐳', name: 'Spouting Whale', keywords: ['whale', 'sea', 'ocean', 'huge'] },
      { char: '🦈', name: 'Shark', keywords: ['shark', 'sea', 'ocean', 'danger'] },
      { char: '🦄', name: 'Unicorn', keywords: ['unicorn', 'magic', 'rainbow', 'fantasy'] },
      { char: '🍀', name: 'Four Leaf Clover', keywords: ['clover', 'luck', 'green', 'irish'] },
      { char: '🌱', name: 'Seedling', keywords: ['plant', 'sprout', 'grow', 'green'] },
      { char: '🌴', name: 'Palm Tree', keywords: ['tree', 'beach', 'summer', 'island'] },
      { char: '🌵', name: 'Cactus', keywords: ['cactus', 'desert', 'plant'] },
      { char: '🍁', name: 'Maple Leaf', keywords: ['leaf', 'fall', 'autumn', 'canada'] },
      { char: '🌈', name: 'Rainbow', keywords: ['rainbow', 'colorful', 'rain', 'sky'] },
      { char: '☀️', name: 'Sun', keywords: ['sun', 'weather', 'hot', 'summer'] },
      { char: '🌙', name: 'Crescent Moon', keywords: ['moon', 'night', 'sky', 'sleep'] },
      { char: '⭐', name: 'Star', keywords: ['star', 'sky', 'yellow', 'gold'] },
      { char: '⚡', name: 'High Voltage', keywords: ['lightning', 'thunder', 'storm', 'power'] },
      { char: '❄️', name: 'Snowflake', keywords: ['snow', 'winter', 'cold'] },
      { char: '🌊', name: 'Water Wave', keywords: ['wave', 'ocean', 'sea', 'surf'] }
    ]
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: <Coffee className="w-4 h-4 text-amber-600" />,
    emojis: [
      { char: '🍎', name: 'Red Apple', keywords: ['apple', 'fruit', 'food', 'healthy'] },
      { char: '🍌', name: 'Banana', keywords: ['banana', 'fruit', 'food', 'yellow'] },
      { char: '🍉', name: 'Watermelon', keywords: ['watermelon', 'fruit', 'summer', 'food'] },
      { char: '🍇', name: 'Grapes', keywords: ['grapes', 'fruit', 'food', 'wine'] },
      { char: '🍓', name: 'Strawberry', keywords: ['strawberry', 'fruit', 'sweet', 'food'] },
      { char: '🍒', name: 'Cherries', keywords: ['cherry', 'fruit', 'sweet', 'food'] },
      { char: '🍑', name: 'Peach', keywords: ['peach', 'fruit', 'butt', 'sweet'] },
      { char: '🍍', name: 'Pineapple', keywords: ['pineapple', 'fruit', 'tropical', 'food'] },
      { char: '🥥', name: 'Coconut', keywords: ['coconut', 'tropical', 'fruit'] },
      { char: '🥑', name: 'Avocado', keywords: ['avocado', 'healthy', 'guac', 'green'] },
      { char: '🍕', name: 'Pizza', keywords: ['pizza', 'cheese', 'italian', 'food', 'junk'] },
      { char: '🍔', name: 'Burger', keywords: ['hamburger', 'beef', 'fastfood', 'junk'] },
      { char: '🍟', name: 'French Fries', keywords: ['fries', 'fastfood', 'junk', 'potato'] },
      { char: '🌭', name: 'Hot Dog', keywords: ['hotdog', 'fastfood', 'sausage'] },
      { char: '🌮', name: 'Taco', keywords: ['taco', 'mexican', 'food'] },
      { char: '🍣', name: 'Sushi', keywords: ['sushi', 'japanese', 'fish', 'rice'] },
      { char: '🍜', name: 'Steaming Bowl', keywords: ['ramen', 'noodles', 'soup', 'japanese'] },
      { char: '🍝', name: 'Spaghetti', keywords: ['pasta', 'noodle', 'italian', 'food'] },
      { char: '🥓', name: 'Bacon', keywords: ['bacon', 'pork', 'breakfast', 'meat'] },
      { char: '🍳', name: 'Cooking', keywords: ['egg', 'breakfast', 'pan'] },
      { char: '🥞', name: 'Pancakes', keywords: ['pancakes', 'breakfast', 'sweet'] },
      { char: '🍰', name: 'Shortcake', keywords: ['cake', 'slice', 'sweet', 'dessert'] },
      { char: '🎂', name: 'Birthday Cake', keywords: ['cake', 'birthday', 'sweet', 'party'] },
      { char: '🧁', name: 'Cupcake', keywords: ['cupcake', 'sweet', 'dessert'] },
      { char: '🍩', name: 'Donut', keywords: ['donut', 'sweet', 'dessert'] },
      { char: '🍪', name: 'Cookie', keywords: ['cookie', 'chocolate', 'sweet', 'biscuit'] },
      { char: '🍫', name: 'Chocolate Bar', keywords: ['chocolate', 'sweet', 'candy'] },
      { char: '🍿', name: 'Popcorn', keywords: ['popcorn', 'movie', 'snack'] },
      { char: '🍯', name: 'Honey Pot', keywords: ['honey', 'sweet', 'bear'] },
      { char: '☕', name: 'Hot Beverage', keywords: ['coffee', 'tea', 'cafe', 'morning'] },
      { char: '🍵', name: 'Teacup Without Handle', keywords: ['tea', 'matcha', 'green'] },
      { char: '🥛', name: 'Glass of Milk', keywords: ['milk', 'drink'] },
      { char: '🧃', name: 'Juice Box', keywords: ['juice', 'drink'] },
      { char: '🍺', name: 'Beer Mug', keywords: ['beer', 'drink', 'alcohol', 'pub'] },
      { char: '🍻', name: 'Clinking Beer Mugs', keywords: ['beers', 'cheers', 'drink', 'alcohol'] },
      { char: '🥂', name: 'Clinking Glasses', keywords: ['cheers', 'champagne', 'wine', 'celebrate'] },
      { char: '🍷', name: 'Wine Glass', keywords: ['wine', 'alcohol', 'drink', 'fancy'] },
      { char: '🥃', name: 'Tumbler Glass', keywords: ['whiskey', 'bourbon', 'drink', 'alcohol'] },
      { char: '🍹', name: 'Tropical Drink', keywords: ['cocktail', 'drink', 'beach', 'summer'] },
      { char: '🍾', name: 'Bottle with Popping Cork', keywords: ['champagne', 'celebrate', 'party', 'wine'] }
    ]
  },
  {
    id: 'activities',
    name: 'Activities & Events',
    icon: <Trophy className="w-4 h-4 text-purple-400" />,
    emojis: [
      { char: '⚽', name: 'Soccer Ball', keywords: ['soccer', 'football', 'ball', 'sports'] },
      { char: '🏀', name: 'Basketball', keywords: ['basketball', 'ball', 'sports'] },
      { char: '🏈', name: 'American Football', keywords: ['football', 'sports', 'superbowl'] },
      { char: '⚾', name: 'Baseball', keywords: ['baseball', 'ball', 'sports'] },
      { char: '🎾', name: 'Tennis', keywords: ['tennis', 'ball', 'sports'] },
      { char: '🏐', name: 'Volleyball', keywords: ['volleyball', 'ball', 'sports'] },
      { char: '🎱', name: 'Pool 8 Ball', keywords: ['pool', 'billiards', 'eightball'] },
      { char: '🏓', name: 'Ping Pong', keywords: ['pingpong', 'tabletennis', 'sports'] },
      { char: '🎮', name: 'Video Game', keywords: ['game', 'controller', 'playstation', 'xbox'] },
      { char: '🎯', name: 'Bullseye', keywords: ['darts', 'target', 'hit', 'focus'] },
      { char: '🎲', name: 'Game Die', keywords: ['dice', 'boardgame', 'gamble'] },
      { char: '🎨', name: 'Artist Palette', keywords: ['art', 'paint', 'draw', 'creative'] },
      { char: '🎬', name: 'Clapper Board', keywords: ['movie', 'director', 'film', 'cinema'] },
      { char: '🎤', name: 'Microphone', keywords: ['sing', 'karaoke', 'voice', 'music'] },
      { char: '🎧', name: 'Headphone', keywords: ['music', 'listen', 'audio'] },
      { char: '🎸', name: 'Guitar', keywords: ['music', 'instrument', 'guitar', 'rock'] },
      { char: '🎹', name: 'Musical Keyboard', keywords: ['music', 'piano', 'keyboard'] },
      { char: '🎵', name: 'Musical Note', keywords: ['music', 'note', 'song'] },
      { char: '🎶', name: 'Musical Notes', keywords: ['music', 'notes', 'song'] },
      { char: '🏆', name: 'Trophy', keywords: ['trophy', 'win', 'winner', 'prize', 'first'] },
      { char: '🥇', name: '1st Place Medal', keywords: ['gold', 'medal', 'winner', 'first'] },
      { char: '🎫', name: 'Ticket', keywords: ['ticket', 'event', 'movie', 'concert'] },
      { char: '✈️', name: 'Airplane', keywords: ['airplane', 'flight', 'travel', 'vacation'] },
      { char: '🏝️', name: 'Desert Island', keywords: ['island', 'beach', 'vacation', 'tropical'] },
      { char: '🏖️', name: 'Beach with Umbrella', keywords: ['beach', 'summer', 'umbrella', 'vacation'] },
      { char: '🎡', name: 'Ferris Wheel', keywords: ['ferris', 'wheel', 'fair', 'amusement'] },
      { char: '🎢', name: 'Roller Coaster', keywords: ['roller', 'coaster', 'theme', 'amusement'] },
      { char: '🚗', name: 'Automobile', keywords: ['car', 'drive', 'travel'] },
      { char: '🚀', name: 'Rocket', keywords: ['rocket', 'space', 'launch', 'fast'] },
      { char: '🛸', name: 'UFO', keywords: ['ufo', 'alien', 'space'] }
    ]
  },
  {
    id: 'objects',
    name: 'Objects & Flags',
    icon: <Flag className="w-4 h-4 text-violet-400" />,
    emojis: [
      { char: '📱', name: 'Mobile Phone', keywords: ['phone', 'iphone', 'tech'] },
      { char: '💻', name: 'Laptop', keywords: ['computer', 'laptop', 'tech', 'work'] },
      { char: '📷', name: 'Camera', keywords: ['camera', 'photo', 'picture'] },
      { char: '📺', name: 'Television', keywords: ['tv', 'screen', 'show'] },
      { char: '⏰', name: 'Alarm Clock', keywords: ['clock', 'time', 'wake'] },
      { char: '⏳', name: 'Hourglass', keywords: ['time', 'wait', 'sand'] },
      { char: '💵', name: 'Dollar Bill', keywords: ['money', 'cash', 'usd'] },
      { char: '💸', name: 'Money with Wings', keywords: ['money', 'spend', 'rich'] },
      { char: '💳', name: 'Credit Card', keywords: ['card', 'pay', 'visa'] },
      { char: '📝', name: 'Memo', keywords: ['write', 'note', 'paper'] },
      { char: '📌', name: 'Pushpin', keywords: ['pin', 'board', 'note'] },
      { char: '🔑', name: 'Key', keywords: ['key', 'lock', 'unlock', 'secret'] },
      { char: '🔒', name: 'Locked', keywords: ['lock', 'closed', 'secure'] },
      { char: '🔓', name: 'Unlocked', keywords: ['lock', 'open', 'secure'] },
      { char: '💡', name: 'Light Bulb', keywords: ['light', 'idea', 'bulb', 'smart'] },
      { char: '🔦', name: 'Flashlight', keywords: ['light', 'torch', 'dark'] },
      { char: '📖', name: 'Open Book', keywords: ['book', 'read', 'study'] },
      { char: '📚', name: 'Books', keywords: ['books', 'study', 'library', 'read'] },
      { char: '🔮', name: 'Crystal Ball', keywords: ['magic', 'future', 'fortune'] },
      { char: '🧸', name: 'Teddy Bear', keywords: ['toy', 'cute', 'bear'] },
      { char: '🏁', name: 'Chequered Flag', keywords: ['flag', 'race', 'finish'] },
      { char: '🚩', name: 'Triangular Flag', keywords: ['flag', 'warning', 'point'] },
      { char: '🏳️‍🌈', name: 'Rainbow Flag', keywords: ['pride', 'rainbow', 'flag', 'lgbt'] },
      { char: '🇺🇸', name: 'US Flag', keywords: ['usa', 'flag', 'america'] },
      { char: '🇬🇧', name: 'UK Flag', keywords: ['uk', 'flag', 'britain'] },
      { char: '🇨🇦', name: 'Canada Flag', keywords: ['canada', 'flag'] },
      { char: '🇮🇳', name: 'India Flag', keywords: ['india', 'flag'] },
      { char: '🇯🇵', name: 'Japan Flag', keywords: ['japan', 'flag'] },
      { char: '🇪🇸', name: 'Spain Flag', keywords: ['spain', 'flag'] },
      { char: '🇫🇷', name: 'France Flag', keywords: ['france', 'flag'] }
    ]
  }
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('love');
  const [hoveredEmoji, setHoveredEmoji] = useState<EmojiItem | null>(null);

  // Flattened search map
  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const results: EmojiItem[] = [];
    
    // De-duplicate results while searching across all categories
    const seen = new Set<string>();
    
    for (const cat of emojiDataset) {
      for (const item of cat.emojis) {
        if (seen.has(item.char)) continue;
        
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesKeywords = item.keywords.some(k => k.includes(q));
        
        if (matchesName || matchesKeywords) {
          results.push(item);
          seen.add(item.char);
        }
      }
    }
    return results;
  }, [searchQuery]);

  const currentCategory = useMemo(() => {
    return emojiDataset.find(cat => cat.id === activeCategory) || emojiDataset[0];
  }, [activeCategory]);

  return (
    <div className="flex flex-col w-72 h-80 bg-neutral-900/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl overflow-hidden font-sans select-none">
      {/* Search Header */}
      <div className="p-3 border-b border-white/10 flex flex-col gap-2 shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="Search emojis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl py-1.5 pl-8 pr-8 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all"
            autoFocus
          />
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white hover:bg-white/5 p-0.5 rounded transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs (Only show if not searching) */}
      {!searchQuery && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 bg-black/20 border-b border-white/5 shrink-0 overflow-x-auto scrollbar-none">
          {emojiDataset.map((cat, idx) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={`emoji-cat-${cat.id}-${idx}`}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                title={cat.name}
                className={`p-2 rounded-xl transition-all cursor-pointer flex-1 flex justify-center items-center ${
                  isSelected 
                    ? 'bg-rose-500/15 text-white scale-105' 
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                }`}
              >
                {cat.icon}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar min-h-0 bg-neutral-900/40">
        {filteredEmojis !== null ? (
          /* Search Results */
          <div>
            <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider font-mono mb-2.5">
              Search Results ({filteredEmojis.length})
            </div>
            {filteredEmojis.length > 0 ? (
              <div className="grid grid-cols-6 gap-2">
                {filteredEmojis.map((emoji, index) => (
                  <button
                    key={`search-${emoji.char}-${index}`}
                    type="button"
                    onClick={() => onSelect(emoji.char)}
                    onMouseEnter={() => setHoveredEmoji(emoji)}
                    onMouseLeave={() => setHoveredEmoji(null)}
                    className="text-2xl p-1.5 rounded-xl hover:bg-white/10 active:scale-90 transition-all cursor-pointer hover:scale-120 flex items-center justify-center"
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-neutral-500 font-sans">
                No matching emojis found 🥺
              </div>
            )}
          </div>
        ) : (
          /* Category Emojis */
          <div>
            <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider font-mono mb-2.5">
              {currentCategory.name}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {currentCategory.emojis.map((emoji, index) => (
                <button
                  key={`cat-${activeCategory}-${emoji.char}-${index}`}
                  type="button"
                  onClick={() => onSelect(emoji.char)}
                  onMouseEnter={() => setHoveredEmoji(emoji)}
                  onMouseLeave={() => setHoveredEmoji(null)}
                  className="text-2xl p-1.5 rounded-xl hover:bg-white/10 active:scale-90 transition-all cursor-pointer hover:scale-120 flex items-center justify-center"
                >
                  {emoji.char}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Preview / Close bar */}
      <div className="px-3.5 py-2 border-t border-white/10 bg-black/30 flex items-center justify-between text-xs text-neutral-400 font-sans shrink-0 h-9">
        {hoveredEmoji ? (
          <div className="flex items-center gap-2 animate-fade-in truncate">
            <span className="text-lg leading-none">{hoveredEmoji.char}</span>
            <span className="font-medium text-neutral-300 truncate max-w-[160px]">
              {hoveredEmoji.name}
            </span>
            <span className="text-[10px] font-mono text-neutral-500 truncate">
              :{hoveredEmoji.keywords[0]}:
            </span>
          </div>
        ) : (
          <span className="text-neutral-500 italic truncate">
            Select an emoji to send
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded transition-all cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};
