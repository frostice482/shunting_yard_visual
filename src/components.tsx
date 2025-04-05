import { textState, ValueState } from "./state"
import { HTML } from "jsx-dom"
import { jsx, JSX } from "jsx-dom/jsx-runtime"
import type { MathParser } from "./mathparser"

export function Tab({name, nostyle, ...btn}: TabBtnOptions) {
	const btnElm = jsx('button', btn)
	if (!nostyle) btnElm.classList.add('tab')
	if (name) {
		if (!btnElm.hasChildNodes()) btnElm.append(name)
		btnElm.dataset.tabname = name
	}
	return btnElm
}

export function StateButton(opts: StateButtonOptions) {
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

export function Token(opts: TokenOptions) {
	const { token, inactive = false, funcCall = false, ...span } = opts

	const e = jsx('span', span)
	e.classList.add('token-'+token.source)
	if (e.childNodes.length === 0) e.append(token.token)

	if (inactive) e.classList.add('token-inactive')

	if (token.source === 'funcCall' && funcCall) {
		e.append(<span class="commasep" style={{color: 'white'}}>(
			{token.params.map(v => <span class="tokens-list">{v.map(token => <Token funcCall token={token}/>)}</span>)}
		)</span>)
	}

	return e
}

export function TokenList(opts: TokenListOptions) {
	const { tokens, tokenOptions, ...code } = opts

	const e = jsx('code', code)
	e.classList.add('tokens-list')
	if (tokens) e.append(...tokens.map(v => <Token {...tokenOptions} token={v}/>))

	return e
}

export function Table(opts: TableOptions) {
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

type span = JSX.IntrinsicElements['button']
type code = JSX.IntrinsicElements['code']
type btn = JSX.IntrinsicElements['button']
type table = JSX.IntrinsicElements['table']

export interface TabBtnOptions extends btn {
	name?: string
	nostyle?: boolean
}

export interface TokenOptions extends span {
	token: MathParser.Token
	inactive?: boolean
	funcCall?: boolean
}

export interface TokenListOptions extends code  {
	tokens?: readonly MathParser.Token[]
	tokenOptions?: Omit<TokenOptions, 'token'>
}

export interface StateButtonOptions extends Omit<btn, 'onClick'> {
	textState?: ValueState<Text, string | null> | string
	once?: boolean
	condition?: (this: HTML.Button) => unknown
	onClick?: (this: HTML.Button, event: PointerEvent & { currentTarget: HTML.Button }, textState: ValueState<Text, string | null>) => void
	onClickError?: (this: HTML.Button, err: unknown) => void
}

export interface TableOptions extends table {
	colWidths?: readonly string[],
	headTitles?: readonly (string | Node)[],
	headUseHr?: boolean
	fillX?: boolean
	rowHoverEffects?: boolean
	noStyle?: boolean
}