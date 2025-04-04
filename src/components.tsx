import { textState, ValueState } from "./state"
import { HTML } from "jsx-dom"
import { jsx, JSX } from "jsx-dom/jsx-runtime"
import type { MathParser } from "./mathparser"

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

export function Token({ token, inactive = false }: {token: MathParser.Token, inactive?: boolean}) {
	const e = <span class={'token-'+token.source}>{token.token}</span> as HTMLElement
	if (inactive) e.classList.add('token-inactive')
	return e
}

export function TokenList({tokens}: {tokens?: readonly MathParser.Token[]} = {}) {
	return <code class="tokens-list">{tokens?.map(v => <Token token={v}/>)}</code> as HTMLElement
}

export function Table(opts: table & TableOpts) {
	const { colWidths, headTitles, fillX, noStyle, headUseHr, ...table } = opts
	const tableElm = jsx('table', table)

	if (!noStyle) tableElm.classList.add('styled')
	if (fillX) tableElm.classList.add('fill-x')

	if (colWidths)
		tableElm.append(<colgroup>{colWidths.map(v => <col style={{width: v}}/>)}</colgroup>)

	if (headTitles)
		tableElm.createTHead().insertRow().append(...headTitles.map(v => typeof v === 'string' ? headUseHr ? <th>{v}</th> : <td>{v}</td> : v))

	return tableElm
}

export function RowNameValue(name: string, elm: Node) {
	return <tr>
		<td>{name}</td>
		<td>:</td>
		<td>{elm}</td>
	</tr>
}

type btn = JSX.IntrinsicElements['button']
type table = JSX.IntrinsicElements['table']

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

export interface TableOpts {
	colWidths?: readonly string[],
	headTitles?: readonly (string | Node)[],
	headUseHr?: boolean
	fillX?: boolean
	noStyle?: boolean
}