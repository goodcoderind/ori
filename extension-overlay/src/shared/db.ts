/**
 * ProSocratic Local Database — Dexie.js (IndexedDB wrapper)
 *
 * Per the Privacy Framework:
 * "Local-First Processing. The learner profile lives in IndexedDB.
 *  No cloud required for core features."
 *
 * This stores the learner profile locally on the device. Data never
 * leaves unless the student explicitly opts into encrypted cloud sync.
 */

import Dexie, { type EntityTable } from 'dexie'
import type { LearnerProfile, TechniqueRecord, SessionData } from './types'

// ─── Database Schema ──────────────────────────────────────────
class ProSocraticDB extends Dexie {
  profiles!: EntityTable<LearnerProfile, 'id'>
  techniqueRecords!: EntityTable<TechniqueRecord & { id?: number }, 'id'>
  sessions!: EntityTable<SessionData & { id?: number }, 'id'>

  constructor() {
    super('ProSocraticDB')

    this.version(1).stores({
      profiles: 'id, domain, archetype, updatedAt',
      techniqueRecords: '++id, technique, domain, usedAt',
      sessions: '++id, sessionId, startedAt, domain',
    })
  }
}

export const db = new ProSocraticDB()

// ─── Profile Operations ───────────────────────────────────────

export async function getOrCreateProfile(domain: string): Promise<LearnerProfile> {
  let profile = await db.profiles.where('domain').equals(domain).first()

  if (!profile) {
    profile = {
      id: `profile-${Date.now()}`,
      domain,
      archetype: 'hybrid',      // Default until enough data
      archetypeModifiers: [],
      techniqueHistory: [],
      totalSessions: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.profiles.add(profile)
  }

  return profile
}

export async function updateProfile(
  profileId: string,
  updates: Partial<LearnerProfile>
): Promise<void> {
  await db.profiles.update(profileId, {
    ...updates,
    updatedAt: Date.now(),
  })
}

export async function recordTechniqueUsage(record: TechniqueRecord): Promise<void> {
  await db.techniqueRecords.add(record)

  // Also update the profile's technique history
  const profile = await db.profiles
    .where('domain')
    .equals(record.domain)
    .first()

  if (profile) {
    const history = [...profile.techniqueHistory, record].slice(-100) // Keep last 100
    await updateProfile(profile.id, { techniqueHistory: history })
  }
}

export async function getSuccessRate(
  technique: string,
  domain?: string
): Promise<number> {
  let query = db.techniqueRecords.where('technique').equals(technique)

  const records = await query.toArray()
  const filtered = domain
    ? records.filter(r => r.domain === domain)
    : records

  if (filtered.length === 0) return 0

  const successes = filtered.filter(r => r.engaged && r.confusionResolved)
  return successes.length / filtered.length
}

// ─── Session Operations ───────────────────────────────────────

export async function saveSession(session: SessionData): Promise<void> {
  const existing = await db.sessions
    .where('sessionId')
    .equals(session.sessionId)
    .first()

  if (existing) {
    await db.sessions.update(existing.id!, session)
  } else {
    await db.sessions.add(session)
  }
}

export async function getRecentSessions(limit = 10): Promise<SessionData[]> {
  return db.sessions.orderBy('startedAt').reverse().limit(limit).toArray()
}

// ─── Data Portability ─────────────────────────────────────────
// "One-click JSON export of your entire learner profile.
//  One-click delete wipes IndexedDB and any cloud copy."

export async function exportAllData(): Promise<string> {
  const profiles = await db.profiles.toArray()
  const records = await db.techniqueRecords.toArray()
  const sessions = await db.sessions.toArray()

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    profiles,
    techniqueRecords: records,
    sessions,
  }, null, 2)
}

export async function deleteAllData(): Promise<void> {
  await db.profiles.clear()
  await db.techniqueRecords.clear()
  await db.sessions.clear()

  // Also clear chrome.storage
  try {
    await chrome.storage.local.remove([
      'prosocratic_sessions',
      'prosocratic_current_session',
    ])
  } catch {
    // Not in extension context
  }
}
