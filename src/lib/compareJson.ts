import { toJSONContent, type Content, type OnClassName } from 'svelte-jsoneditor'

type JSONPath = Parameters<OnClassName>[0]

export type DiffSide = 'left' | 'right'

export function parseEditorJson(content: Content | undefined): unknown | undefined {
	if (!content) return undefined
	try {
		return toJSONContent(content).json
	} catch {
		return undefined
	}
}

function getAtPath(
	root: unknown,
	path: JSONPath
): { exists: false } | { exists: true; value: unknown } {
	let current: unknown = root
	for (const segment of path) {
		if (current === null || typeof current !== 'object') {
			return { exists: false }
		}
		if (Array.isArray(current)) {
			const index = typeof segment === 'number' ? segment : Number(segment)
			if (!Number.isInteger(index) || index < 0 || index >= current.length) {
				return { exists: false }
			}
			current = current[index]
		} else if (!Object.hasOwn(current, String(segment))) {
			return { exists: false }
		} else {
			current = (current as Record<string, unknown>)[String(segment)]
		}
	}
	return { exists: true, value: current }
}

function isContainer(value: unknown): boolean {
	return value !== null && typeof value === 'object'
}

function sameContainerKind(a: unknown, b: unknown): boolean {
	return Array.isArray(a) === Array.isArray(b)
}

function hasDescendantDiff(value: unknown, other: unknown): boolean {
	if (!isContainer(value) || !isContainer(other) || !sameContainerKind(value, other)) {
		return !Object.is(value, other)
	}

	if (Array.isArray(value) && Array.isArray(other)) {
		if (value.length !== other.length) return true
		return value.some((item, index) => hasDescendantDiff(item, other[index]))
	}

	const selfObj = value as Record<string, unknown>
	const otherObj = other as Record<string, unknown>
	const keys = new Set([...Object.keys(selfObj), ...Object.keys(otherObj)])
	for (const key of keys) {
		if (!Object.hasOwn(selfObj, key) || !Object.hasOwn(otherObj, key)) return true
		if (hasDescendantDiff(selfObj[key], otherObj[key])) return true
	}
	return false
}

export function createCompareClassName(otherJson: unknown, side: DiffSide): OnClassName {
	return (path, value) => {
		const other = getAtPath(otherJson, path)
		if (!other.exists) {
			return side === 'left' ? 'jse-diff-removed' : 'jse-diff-added'
		}
		if (isContainer(value)) {
			if (!isContainer(other.value) || !sameContainerKind(value, other.value)) {
				return 'jse-diff-changed'
			}
			return hasDescendantDiff(value, other.value) ? 'jse-diff-parent' : undefined
		}
		if (!Object.is(value, other.value)) {
			return 'jse-diff-changed'
		}
		return undefined
	}
}

export function createCompareClassNames(
	leftJson: unknown | undefined,
	rightJson: unknown | undefined,
	enabled: boolean
): { left?: OnClassName; right?: OnClassName } {
	if (!enabled || leftJson === undefined || rightJson === undefined) {
		return {}
	}
	return {
		left: createCompareClassName(rightJson, 'left'),
		right: createCompareClassName(leftJson, 'right')
	}
}
