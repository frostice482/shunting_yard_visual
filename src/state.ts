/**
 * get/set variable in function form
 * @param value Initial value
 * @param change Function to call when value has been changed
 */
export function valueState<T, S = T>(value: T, change = (next: S, prev: T): T => next as never): ValueState<T, S> {
	const state = function() {
		if (0 in arguments) value = change(arguments[0], value)
		return value
	}

	state.valueOf = () => value
	state.toString = () => String(value)
	return state
}

/**
 * get/set variable for input nodes
 * @param value Initial value
 * @param change Function to call when value has been changed
 */
export function inputState<T extends InputValues>(value: T, change?: (next: T, prev: T) => T) {
	const state = valueState(value, change) as InputState<T>
	state.input = (ev) => {
		let newValue
		const input = ev.currentTarget
		if (input instanceof HTMLInputElement) switch (input.type) {
			// bool
			case 'checkbox':
			case 'radio':
				newValue = input.checked
			break

			// date
			case 'date':
			case 'datetime-local':
				newValue = input.valueAsDate ?? new Date(NaN)
			break

			// file
			case 'file':
				newValue = input.files ?? new FileList()
			break

			// number
			case 'number':
			case 'range':
			case 'time':
				newValue = input.valueAsNumber
			break
		}

		newValue ??= input.value

		if (value?.constructor !== newValue?.constructor) {
			switch (typeof value) {
				case 'string': newValue = String(newValue); break
				case 'number': newValue = Number(newValue); break
				case 'boolean': newValue = Boolean(newValue); break

				default: {
					if (value instanceof Date) {
						newValue = new Date(Number(newValue))
					}
				}
			}
		}

		return state(newValue as never)
	}
	return state
}

/**
 * Node get/set variable in function form,
 * which replaces old node with new node when value changes
 * @param value Initial node
 * @param change Function to call when node has changed
 */
export function nodeState<T extends Node = Node | Text>(value: T = document.createComment('') as any, change = (next: T, prev: T): T => next): NodeState<T> {
	const s = valueState(value, (next: any, prev) => {
		if (next === null) next = document.createComment('')
		if (typeof next === 'string') next = document.createTextNode(next)
		if (next === prev) return next
		next = change(next, prev)
		prev.parentNode?.replaceChild(next, prev)
		return next
	}) as NodeState<T>

	Object.defineProperty(s, 'rootNode', {
		get() { return s() },
		configurable: true
	})

	return s
}

export function textState(defaultText = '') {
	return valueState<Text, string | null>(document.createTextNode(defaultText), (n, p) => {
		p.data = n ?? defaultText
		return p
	})
}

export interface ValueState<T, S = T> {
	(): T
	(setValue: S): T
	valueOf(): T
}

export interface NodeState<T extends Node = Node> extends ValueState<T, T extends Text ? string : T | null> {
	get rootNode(): T
}

export interface InputState<T extends InputValues> extends ValueState<T> {
	input(ev: Event & { currentTarget: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }): T
}

export type InputValues = string | number | boolean | Date | FileList
