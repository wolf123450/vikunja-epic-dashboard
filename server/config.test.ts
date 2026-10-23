import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = { VIKUNJA_API_URL: 'http://vikunja:3456/', VIKUNJA_TOKEN: 'tk_test' };

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(base);
    expect(c.vikunjaApiUrl).toBe('http://vikunja:3456');
    expect(c.vikunjaPublicUrl).toBe('http://vikunja:3456');
    expect(c.projectIds).toBeNull();
    expect(c.includeChildProjects).toBe(true);
    expect(c.pointsScale).toBeNull();
    expect(c.epicAllowOverlap).toBe(true);
    expect(c.epicParentPoints).toBe(false);
    expect(c.epicMode).toBe('both');
    expect(c.port).toBe(8080);
    expect(c.pointsSplitThreshold).toBe(5);
  });

  it('parses lists and pairs', () => {
    const c = loadConfig({
      ...base,
      PROJECT_IDS: '12, 15',
      INCLUDE_CHILD_PROJECTS: 'false',
      KANBAN_VIEW_ID: '12:34,15:40',
      BUCKET_COLORS: 'In Review:#a855f7',
      POINTS_SCALE: '0.5, 1, 2, 21, 100',
    });
    expect(c.pointsScale).toEqual([0.5, 1, 2, 21, 100]);
    expect(c.projectIds).toEqual([12, 15]);
    expect(c.includeChildProjects).toBe(false);
    expect(c.kanbanViewIds.get(15)).toBe(40);
    expect(c.bucketColors.get('in review')).toBe('#a855f7');
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ ...base, PORT: '' }).port).toBe(8080);
  });

  it('names every invalid variable', () => {
    expect(() => loadConfig({ VIKUNJA_API_URL: 'nope', EPIC_MODE: 'x' })).toThrow(
      /VIKUNJA_API_URL[\s\S]*VIKUNJA_TOKEN[\s\S]*EPIC_MODE/,
    );
  });

  it('rejects malformed pairs and time zones', () => {
    expect(() => loadConfig({ ...base, KANBAN_VIEW_ID: '12-34' })).toThrow(/KANBAN_VIEW_ID/);
    expect(() => loadConfig({ ...base, TZ: 'Mars/Olympus' })).toThrow(/TZ/);
  });
});
