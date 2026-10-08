import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is required');
}

console.log('Creating Gemini client');

const ai = new GoogleGenAI({ apiKey });

console.log('Calling Gemini API...');

console.time('gemini');

const result = await ai.interactions.create({
  model: 'gemini-3.7-flash',
  input: 'Say hello in one sentence.',
});

console.timeEnd('gemini');
console.log(result.output_text);
