import { PassThrough, Writable } from 'node:stream';
import inquirer from 'inquirer';
import { describe, expect, it } from 'vitest';

describe('Inquirer compatibility', () => {
  it.each([
    { type: 'input', response: 'hello\n', expected: 'hello', options: {} },
    { type: 'list', response: '\n', expected: 'one', options: {
      choices: [{ name: 'One', value: 'one' }, { name: 'Two', value: 'two' }],
    } },
    { type: 'confirm', response: 'y\n', expected: true, options: {} },
    { type: 'password', response: 'secret\n', expected: 'secret', options: { mask: '*' } },
  ])('supports the $type prompt used by the CLI', async ({ type, response, expected, options }) => {
    const input = new PassThrough();
    const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
    const prompt = inquirer.createPromptModule({ input, output });
    const answer = prompt({ type, name: 'value', message: 'Compatibility', ...options });
    const timer = setTimeout(() => input.write(response), 30);

    try {
      await expect(answer).resolves.toEqual({ value: expected });
    } finally {
      clearTimeout(timer);
      answer.ui.close();
      input.destroy();
      output.destroy();
    }
  });
});
