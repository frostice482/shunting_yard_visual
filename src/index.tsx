import { inputState, nodeState, textState } from "./state";
import mathParser, { MathParser } from "./mathparser";
import { RowNameValue, StateButton, Table, Token, TokenList } from "./components";
import { sleep } from "./util";
import PromiseController from "./prmctrl";

const inputExpr = inputState<string>('(-3+1)-(-1*-8)*(8/-4)+2/8*4-16/4+4')
const resultElm = nodeState()
let updateInterval = inputState<number>(100)
let paused = false
let prm = new PromiseController<void>()

const links = [
	['Shunting Yard', 'https://en.wikipedia.org/wiki/Shunting_yard_algorithm'],
	['RPN (Reverse Polish Notation)', 'https://en.wikipedia.org/wiki/Reverse_Polish_notation'],
	['PN (Polish Notation)', 'https://en.wikipedia.org/wiki/Polish_notation'],
	['Order of operations', 'https://en.wikipedia.org/wiki/Order_of_operations#Programming_languages']
]

document.body.append(<>
	<h2>Shunting Yard Visualizer</h2>
	<div class="flex-row gap-4">
		Input: <input style={{flex: '1 1'}} type="text" onChange={inputExpr.input} value={inputExpr()}/>
		Interval: <input style={{flex: '0.1 1', minWidth: '60px'}} type="number" min={1} onChange={updateInterval.input} value={updateInterval()}/> ms
	</div>
	<div class="flex-row gap-8 justify-center margin-y">
		<button onClick={startProcess}>start</button>
		<StateButton textState="pause" onClick={(ev, state) => {
			paused = !paused
			if (!paused) step()
			state(paused ? 'resume' : 'pause')
		}}/>
		<button onClick={step}>step</button>
	</div>
	{resultElm()}
	<div class="flex-sep"/>
	<footer>
		<ul>
			{links.map(([name, link]) => <li><a href={link} target="_blank">{name}</a></li>)}
		</ul>
	</footer>
</>)

async function startProcess() {
	for (const _ of process()) {
		if (paused) await prm
		else await sleep(updateInterval())
	}
}

function step() {
	prm.resolve()
	prm = new PromiseController
}

function* process() {
	const tokensElm = TokenList({})
	const notationElm = TokenList({})
	const opstackElm = TokenList({})
	const resultStackElm = TokenList({})
	const notationLog = <tbody/>

	const text = textState()
	const desc = textState()
	const errorText = textState()

	resultElm(<div class="flex-col">
		<Table class="process fill" colWidths={['8em', '10px']}>
			<tbody>
				{RowNameValue('Input', tokensElm)}
				{RowNameValue('RPN', notationElm)}
				{RowNameValue('Operator stack', opstackElm)}
				{RowNameValue('Result stack', resultStackElm)}
			</tbody>
		</Table>

		<div class="margin-y">
			<code class="error">{errorText()}</code>
			<h3>: {text()}</h3>
			<small>: {desc()}</small>
		</div>

		<details class="fill-x">
			<summary>RPN Log</summary>
			<Table fillX colWidths={['5%', '40%', '15%', '15%', '25%']} headTitles={['Input', 'RPN', 'Operator Stack', 'Action', 'Description']}>
				{notationLog}
			</Table>
		</details>
	</div>)

	const a = yield* processTokenParse(tokensElm)
	if (a.error) return errorText(a.message)

	const b = yield* processNotationBuilder(a.tokens, a.tokensElmList, notationElm, opstackElm, notationLog, updateText)
	if (b.error) return errorText(b.message)

	if (b.evaluable) {
		const c = yield* processEval(b.notation, a.tokensElmList, b.notationElmList, resultStackElm, updateText)
		if (c.error) return errorText(c.message)

		updateText(`Output: ${c.output}`)
	} else {
		updateText('Output not evaluable', '')
	}

	function updateText(header: string, description = '') {
		text(header)
		desc(description)
	}
}

function* processTokenParse(tokensElm: Element) {
	// tokenize expression
	const expr = inputExpr()
	const tokensRes = mathParser.tokenize(expr)
	if (tokensRes.error) {
		tokensElm.replaceChildren(<span>{expr.slice(0, tokensRes.index)}<span class="token-error">{expr.slice(tokensRes.index)}</span></span>)
		return tokensRes
	}
	const tokens = tokensRes.tokens

	// put inactive tokens into result
	const tokensElmList: TokensElmList = new Map
	for (const token of tokens) {
		const elm = <Token token={token} inactive/>
		tokensElm.append(elm)
		tokensElmList.set(token, elm)
	}

	// animate tokens
	for (const elm of tokensElmList.values()) {
		elm.classList.add('token-hl')
		yield 'token'
		elm.classList.remove('token-hl', 'token-inactive')
	}

	return {
		error: false as false,
		tokensElmList: tokensElmList,
		tokens,
	}
}

function* processNotationBuilder(
	tokens: MathParser.Token[],
	tokensElmList: TokensElmList,
	notationElm: Element,
	opstackElm: Element,
	notationLog: Element,
	update: UpdateFunc
) {
	// loop notation builder
	let notationItr = mathParser.iterateBuildRPN(tokens)[Symbol.iterator]()
	let notationItrRes
	const notationElmList = new Map<MathParser.Token, Element>()
	while (!(notationItrRes = notationItr.next()).done) {
		const { type, description, token, insertingToken, notation, opstack } = notationItrRes.value
		let elm = notationElmList.get(token)
		if (!elm) notationElmList.set(token, elm = <Token token={token}/>)
		const tokElm = tokensElmList.get(token)!

		if (type === 'updateParams' && token.source === 'funcCall') {
			const paramList = []
			let first = true
			for (const params of token.params) {
				if (!first) paramList.push(',')
				for (const param of params) {
					paramList.push(notationElmList.get(param)!)
				}
				first = false
			}

			notationElmList.set(token, elm = <span class="tokens-list">{elm}({paramList})</span>)
			continue
		}

		tokElm.classList.add('token-hl')

		// update notation & opstack
		notationElm.replaceChildren(...notation.map(v => notationElmList.get(v) ?? ''))
		opstackElm.replaceChildren(...opstack.map(v => notationElmList.get(v) ?? ''))

		let actionDesc = ''
		switch (type) {
			case 'lookup':
				actionDesc = ''
				update('Lookup operator', description)
				yield
			break
			case 'insertValue':
			case 'insertOpStack':
				actionDesc = type === 'insertValue' ? 'push value' : 'push operator'

				update(type === 'insertValue' ? 'Insert value' : 'Insert operator', description)
				elm.classList.add('token-hl-blue')
				yield

				elm.classList.remove('token-hl-blue')
			break
			case 'popMoveOpStack': {
				actionDesc = 'move operator'
				update('Move last operator to RPN', description)

				const elm2 = opstackElm.appendChild(elm.cloneNode(true))
				elm2.classList.add('token-hl-red')
				elm.classList.add('token-hl-blue')
				yield

				elm2.remove()
				elm.classList.remove('token-hl-blue')
			} break
			case 'popOpStack': {
				actionDesc = 'move operator'
				update('Delete last operator', description)

				opstackElm.appendChild(elm)
				elm.classList.add('token-hl-red')
				yield

				elm.remove()
			} break
		}

		notationLog.append(<tr>
			<td>{insertingToken && <Token token={insertingToken}/>}</td>
			<td><TokenList tokenOptions={{funcCall: true}} tokens={notation}/></td>
			<td><TokenList tokenOptions={{funcCall: true}} tokens={opstack}/></td>
			<td>{actionDesc}</td>
			<td>{description}</td>
		</tr>)

		tokElm.classList.remove('token-hl')
	}
	const nodeRes = notationItrRes.value
	if (nodeRes.error) {
		if (nodeRes.token) {
			notationElmList.get(nodeRes.token)?.classList.add('token-error')
			tokensElmList.get(nodeRes.token)?.classList.add('token-error')
		}
		return nodeRes
	}

	const notation = nodeRes.notation
	notationElm.replaceChildren(...notation.map(v => notationElmList.get(v) ?? ''))
	opstackElm.replaceChildren()

	update('')

	return {
		error: false as false,
		notationElmList,
		notation,
		evaluable: nodeRes.isEvaluable
	}
}

function* processEval(
	notation: MathParser.Token[],
	tokensElmList: TokensElmList,
	notationElmList: TokensElmList,
	resultStackElm: Element,
	update: UpdateFunc
) {
	let evalIterator = mathParser.iterateEvaluateRPN(notation)[Symbol.iterator]()
	let evalItrRes
	while (!(evalItrRes = evalIterator.next()).done) {
		const { value, valueStack, type, token, inner } = evalItrRes.value
		if (type === 'updateStack') {
			update('')
			resultStackElm.replaceChildren(...valueStack.map(v => <span>{v}</span>))
			if (inner) resultStackElm.prepend(<span>...</span>)
			yield
			continue
		}

		const tokElm = notationElmList.get(token)
		tokElm?.classList.add('token-hl')
		const elm = tokensElmList.get(token)
		elm?.classList.add('token-hl')

		switch (type) {
			case 'insertValue':
			case 'funcCall': {
				const elm = <span>{value}</span>
				resultStackElm.appendChild(elm)
				elm.classList.add('token-hl-blue')
				yield

				elm.classList.remove('token-hl-blue')
			} break
			case 'operation': {
				update(`${valueStack.at(-2)} ${token.token} ${valueStack.at(-1)} = ${value}`)

				const elm = <span>{value}</span>
				resultStackElm.appendChild(elm)
				const child = resultStackElm.children
				const lvalue = child.item(child.length-3)
				const rvalue = child.item(child.length-2)

				elm.classList.add('token-hl-blue')
				lvalue?.classList.add('token-hl-red')
				rvalue?.classList.add('token-hl-red')
				yield

				elm.classList.add('token-hl-blue')
				lvalue?.classList.remove('token-hl-red')
				rvalue?.classList.remove('token-hl-red')
			} break
		}

		tokElm?.classList.remove('token-hl')
		elm?.classList.remove('token-hl')
	}
	const evalRes = evalItrRes.value
	if (typeof evalRes !== 'number') {
		notationElmList.get(evalRes.token)?.classList.add('token-error')
		tokensElmList.get(evalRes.token)?.classList.add('token-error')

		return evalRes
	}

	return {
		error: false as false,
		output: evalRes
	}
}

type TokensElmList = Map<MathParser.Token, Element>
type UpdateFunc = (text: string, desc?: string) => void
