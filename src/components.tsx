import { textState, ValueState } from "./state"
import { HTML } from "jsx-dom"
import { jsx, JSX } from "jsx-dom/jsx-runtime"

export function Tab({name, nostyle, ...btn}: TabBtnOptions & btn) {
	const btnElm = jsx('button', btn)
	if (!nostyle) btnElm.classList.add('tab')
	if (name) {
		if (!btnElm.hasChildNodes()) btnElm.append(name)
		btnElm.dataset.tabname = name
	}
	return btnElm
}

export function StateButton(opts: StateButtonOptions & Omit<btn, 'onClick'>) {
	let {
		textState: textStateProp = '',
		once,
		condition,
		onClick,
		onClickError,
		...btn
	} = opts

	const hasTextState = textStateProp !== undefined
	if (typeof textStateProp === 'string') textStateProp = textState(textStateProp)
	const button = jsx('button', btn) as HTML.Button
	if (textStateProp) button.append(textStateProp())

	if (onClick) button.addEventListener('click', async ev => {
		if (condition && !condition.call(button)) return
		try {
			button.disabled = true
			await onClick.call(button, ev as never, textStateProp)

			if (!once) button.disabled = false
		} catch(e) {
			button.disabled = false
			if (hasTextState) textStateProp(null)

			if (onClickError) onClickError.call(button, e)
			else throw e
		}
	})
	return button
}

type btn = JSX.IntrinsicElements['button']

export interface TabBtnOptions {
	name?: string
	nostyle?: boolean
}

export interface StateButtonOptions {
	textState?: ValueState<Text, string | null> | string
	once?: boolean
	condition?: (this: HTML.Button) => unknown
	onClick?: (this: HTML.Button, event: PointerEvent & { currentTarget: HTML.Button }, textState: ValueState<Text, string | null>) => void
	onClickError?: (this: HTML.Button, err: unknown) => void
}
