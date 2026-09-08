import type { Content } from 'svelte-jsoneditor'

const DB_NAME = 'json-editor'
const DB_VERSION = 2
const STORE_NAME = 'workspace'
const CURRENT_KEY = 'current'

export type EditorSettings = {
	compare: boolean
	dark: boolean
	syncScroll: boolean
	leftPct: number
}

export type DocumentRecord = {
	content: Content
	createdAt: number
	updatedAt: number
}

export type CurrentIndex = {
	leftId: string
	rightId: string
	settings: EditorSettings
}

export type WorkspaceState = {
	leftId: string
	rightId: string
	contentLeft: Content
	contentRight: Content
	settings: EditorSettings
}

const defaultSettings = (): EditorSettings => ({
	compare: false,
	dark: false,
	syncScroll: false,
	leftPct: 50
})

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME)
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
	})
}

function store(db: IDBDatabase, mode: IDBTransactionMode) {
	return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
	})
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isContent(value: unknown): value is Content {
	if (!isRecord(value)) return false
	return typeof value.text === 'string' || 'json' in value
}

function toContent(value: unknown): Content | undefined {
	if (!isContent(value)) return undefined
	if ('text' in value && typeof value.text === 'string') {
		return { text: value.text }
	}
	if ('json' in value) {
		return { json: value.json }
	}
	return undefined
}

function toSettings(value: unknown): EditorSettings {
	if (!isRecord(value)) return defaultSettings()
	return {
		compare: typeof value.compare === 'boolean' ? value.compare : false,
		dark: typeof value.dark === 'boolean' ? value.dark : false,
		syncScroll: typeof value.syncScroll === 'boolean' ? value.syncScroll : false,
		leftPct: typeof value.leftPct === 'number' ? value.leftPct : 50
	}
}

function unwrapDocument(value: unknown): Content | undefined {
	if (!isRecord(value)) return undefined
	if (isContent(value.content)) return toContent(value.content)
	return toContent(value)
}

function wrapDocument(content: Content, previous: unknown): DocumentRecord {
	const now = Date.now()
	const extra = isRecord(previous) && 'content' in previous ? { ...previous } : {}
	delete extra.content
	return {
		...extra,
		content,
		createdAt: typeof extra.createdAt === 'number' ? extra.createdAt : now,
		updatedAt: now
	}
}

function isUuidKey(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value !== CURRENT_KEY
}

async function getValue(db: IDBDatabase, key: string): Promise<unknown> {
	return requestToPromise(store(db, 'readonly').get(key))
}

async function putValue(db: IDBDatabase, key: string, value: unknown): Promise<void> {
	await requestToPromise(store(db, 'readwrite').put(value, key))
}

async function deleteValue(db: IDBDatabase, key: string): Promise<void> {
	if (!isUuidKey(key)) return
	await requestToPromise(store(db, 'readwrite').delete(key))
}

function contentEqual(a: Content | undefined, b: Content): boolean {
	if (!a) return false
	return JSON.stringify(a) === JSON.stringify(b)
}

async function replaceDocument(
	db: IDBDatabase,
	previousId: string | undefined,
	content: Content,
	changed: boolean
): Promise<string> {
	if (previousId && !changed) return previousId

	const previousRecord = previousId ? await getValue(db, previousId) : undefined
	const nextId = crypto.randomUUID()
	await putValue(db, nextId, wrapDocument(content, previousRecord))
	if (previousId && previousId !== nextId) {
		await deleteValue(db, previousId)
	}
	return nextId
}

function parseCurrentIndex(value: unknown): CurrentIndex | undefined {
	if (!isRecord(value)) return undefined
	if (!isUuidKey(value.leftId) || !isUuidKey(value.rightId)) return undefined
	return {
		leftId: value.leftId,
		rightId: value.rightId,
		settings: toSettings(value.settings)
	}
}

async function migrateLegacyCurrent(
	db: IDBDatabase,
	legacy: Record<string, unknown>
): Promise<WorkspaceState> {
	const leftId = crypto.randomUUID()
	const rightId = crypto.randomUUID()
	const contentLeft = toContent(legacy.contentLeft) ?? { json: {} }
	const contentRight = toContent(legacy.contentRight) ?? { json: {} }
	const settings = toSettings(legacy.settings)
	const now = Date.now()

	await putValue(db, leftId, { content: contentLeft, createdAt: now, updatedAt: now })
	await putValue(db, rightId, { content: contentRight, createdAt: now, updatedAt: now })
	await putValue(db, CURRENT_KEY, { leftId, rightId, settings } satisfies CurrentIndex)

	return { leftId, rightId, contentLeft, contentRight, settings }
}

export async function loadWorkspace(): Promise<WorkspaceState | undefined> {
	try {
		const db = await openDb()
		const current = await getValue(db, CURRENT_KEY)
		if (!isRecord(current)) return undefined

		const index = parseCurrentIndex(current)
		if (!index) {
			if (toContent(current.contentLeft) || toContent(current.contentRight) || current.settings) {
				return migrateLegacyCurrent(db, current)
			}
			return undefined
		}

		const [leftRecord, rightRecord] = await Promise.all([
			getValue(db, index.leftId),
			getValue(db, index.rightId)
		])

		return {
			leftId: index.leftId,
			rightId: index.rightId,
			contentLeft: unwrapDocument(leftRecord) ?? { json: {} },
			contentRight: unwrapDocument(rightRecord) ?? { json: {} },
			settings: index.settings
		}
	} catch (error) {
		console.error(error)
		return undefined
	}
}

let saveQueue: Promise<void> = Promise.resolve()

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
	saveQueue = saveQueue.then(() => persistWorkspace(state), () => persistWorkspace(state))
	return saveQueue
}

async function persistWorkspace(state: WorkspaceState): Promise<void> {
	try {
		const db = await openDb()
		const current = parseCurrentIndex(await getValue(db, CURRENT_KEY))
		const previousLeftId = current?.leftId ?? (isUuidKey(state.leftId) ? state.leftId : undefined)
		const previousRightId = current?.rightId ?? (isUuidKey(state.rightId) ? state.rightId : undefined)

		const [previousLeftRecord, previousRightRecord] = await Promise.all([
			previousLeftId ? getValue(db, previousLeftId) : Promise.resolve(undefined),
			previousRightId ? getValue(db, previousRightId) : Promise.resolve(undefined)
		])

		const leftId = await replaceDocument(
			db,
			previousLeftId,
			state.contentLeft,
			!contentEqual(unwrapDocument(previousLeftRecord), state.contentLeft)
		)
		const rightId = await replaceDocument(
			db,
			previousRightId,
			state.contentRight,
			!contentEqual(unwrapDocument(previousRightRecord), state.contentRight)
		)

		await putValue(db, CURRENT_KEY, {
			leftId,
			rightId,
			settings: state.settings
		} satisfies CurrentIndex)
	} catch (error) {
		console.error(error)
	}
}
