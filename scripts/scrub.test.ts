import { describe, expect, it } from 'vitest';
import { scrub } from './scrub.js';

const opts = { hosts: ['vk.home.lan:3456'], keepLabelPrefixes: ['sp:', 'epic:'], keepLabels: ['epic'] };
const user = { id: 3, name: 'Real Name', username: 'realuser', email: 'a@b.c', created: 'x', updated: 'y' };

describe('scrub', () => {
  it('replaces task and project text but keeps structure', () => {
    const task = {
      id: 7,
      title: 'Call the dentist',
      description: '<p>private</p>',
      identifier: 'HOME-12',
      index: 12,
      project_id: 2,
      done: true,
      done_at: '2026-01-01T00:00:00Z',
      labels: [
        { id: 1, title: 'SP: 5', hex_color: 'fff', created_by: user },
        { id: 2, title: 'Epic', hex_color: '' },
        { id: 3, title: 'family', hex_color: '' },
      ],
      related_tasks: { subtask: [{ id: 8, title: 'secret', index: 1, project_id: 2, done: false }] },
      created_by: user,
    };
    const out = scrub(task, opts) as typeof task;
    expect(out.title).toBe('Task 7');
    expect(out.identifier).toBe('P2-12');
    expect(out.description).toBe('');
    expect(out.done_at).toBe(task.done_at);
    expect(out.labels.map((l) => l.title)).toEqual(['SP: 5', 'Epic', 'label-3']);
    expect(out.related_tasks.subtask[0]?.title).toBe('Task 8');
    expect(out.created_by).toEqual({ id: 3, name: '', username: 'user3', created: 'x', updated: 'y' });
    expect(JSON.stringify(out)).not.toMatch(/Real Name|realuser|a@b\.c|dentist|family|secret/);
  });

  it('replaces projects, hostnames, and private IPs', () => {
    const out = scrub(
      [
        { id: 2, title: 'Home', identifier: 'HOME', parent_project_id: 0, background_blur_hash: 'abc', owner: user },
        { frontend_url: 'http://vk.home.lan:3456/', motd: 'see http://192.168.1.20:3456' },
      ],
      opts,
    );
    const s = JSON.stringify(out);
    expect(s).toContain('"title":"Project 2"');
    expect(s).toContain('http://vikunja.example/');
    expect(s).not.toMatch(/home\.lan|192\.168|Home|HOME|realuser/);
  });
});
