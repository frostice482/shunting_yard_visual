import { inputState, nodeState, textState } from "./state";
import mathParser, { MathParser } from "./mathparser";
import { StateButton } from "./components";
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

function* process(): Iterable<Step> {
	const tokensElm = TokenList()
	const notationElm = TokenList()
	const opstackElm = TokenList()
	const resultStackElm = TokenList()
	const notationLog = <tbody/>

	const text = textState()
	const desc = textState()
	const errorText = textState()

	resultElm(<div class="flex-col">
		<table class="process fill">
			<colgroup>
				<col style={{width: "8em"}}/>
				<col style={{width: "10px"}}/>
			</colgroup>
			<tbody>
				<tr>
					<td>Input</td>
					<td>:</td>
					<td>{tokensElm}</td>
				</tr>
				<tr>
					<td>RPN</td>
					<td>:</td>
					<td>{notationElm}</td>
				</tr>
				<tr>
					<td>Operator stack</td>
					<td>:</td>
					<td>{opstackElm}</td>
				</tr>
				<tr>
					<td>Result stack</td>
					<td>:</td>
					<td>{resultStackElm}</td>
				</tr>
			</tbody>
		</table>
		<code class="error">{errorText()}</code>
		<h3>{':'} {text()}</h3>
		<small>{':'} {desc()}</small>
		<div>RPN Log</div>
		<table>
			<colgroup>
				<col style={{width: '5%'}}/>
				<col style={{width: '40%'}}/>
				<col style={{width: '15%'}}/>
				<col style={{width: '15%'}}/>
				<col style={{width: '25%'}}/>
			</colgroup>
			<thead>
				<tr>
					<td>Input</td>
					<td>RPN</td>
					<td>Operation Stack</td>
					<td>Action</td>
					<td>Description</td>
				</tr>
			</thead>
			{notationLog}
		</table>
	</div>)

	// tokenize expression
	const expr = inputExpr()
	const tokensRes = mathParser.tokenize(expr)
	if (tokensRes.error) {
		tokensElm.replaceChildren(<span>{expr.slice(0, tokensRes.index)}<span class="token-error">{expr.slice(tokensRes.index)}</span></span>)
		errorText(tokensRes.message)
		return
	}
	const tokens = tokensRes.tokens

	// put inactive tokens into result
	const tokensElmList = new Map<MathParser.Token, Element>()
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

	// loop notation builder
	let nodeIterator = mathParser.iterateBuildRPN(tokens)[Symbol.iterator]()
	let nodeItrRes
	const nodeTokenElmList = new Map<MathParser.Token, Element>()
	while (!(nodeItrRes = nodeIterator.next()).done) {
		const { type, description, token, insertingToken, notation, opstack, inner } = nodeItrRes.value
		let elm = nodeTokenElmList.get(token)
		if (!elm) nodeTokenElmList.set(token, elm = <Token token={token}/>)
		const tokElm = tokensElmList.get(token)!

		if (type === 'updateParams' && token.source === 'funcCall') {
			const paramList = []
			let first = true
			for (const params of token.params) {
				if (!first) paramList.push(',')
				for (const param of params) {
					paramList.push(nodeTokenElmList.get(param)!)
				}
				first = false
			}

			nodeTokenElmList.set(token, elm = <span class="tokens-list">{elm}({paramList})</span>)
			continue
		}

		tokElm.classList.add('token-hl')

		// update notation & opstack
		notationElm.replaceChildren(...notation.map(v => nodeTokenElmList.get(v) ?? ''))
		opstackElm.replaceChildren(...opstack.map(v => nodeTokenElmList.get(v) ?? ''))
		if (inner) {
			notationElm.prepend(<span>...</span>)
			opstackElm.prepend(<span>...</span>)
		}

		let actionDesc = ''
		switch (type) {
			case 'lookup':
				actionDesc = ''
				updateText('Lookup operator', description)
				yield 'node'
			break
			case 'insertValue':
			case 'insertOpStack':
				actionDesc = type === 'insertValue' ? 'push value' : 'push operator'
				updateText(type === 'insertValue' ? 'Insert value' : 'Insert operator', description)
				elm.classList.add('token-hl-blue')
				yield 'node'
				elm.classList.remove('token-hl-blue')
			break
			case 'popMoveOpStack': {
				actionDesc = 'move operator'
				updateText('Move last operator to RPN', description)
				const elm2 = opstackElm.appendChild(elm.cloneNode(true))
				elm2.classList.add('token-hl-red')
				elm.classList.add('token-hl-blue')
				yield 'node'
				elm2.remove()
				elm.classList.remove('token-hl-blue')
			} break
			case 'popOpStack': {
				actionDesc = 'move operator'
				updateText('Delete last operator', description)
				opstackElm.appendChild(elm)
				elm.classList.add('token-hl-red')
				yield 'node'
				elm.remove()
			} break
		}

		notationLog.append(<tr>
			<td>{insertingToken && <Token token={insertingToken}/>}</td>
			<td>{inner && '...'}<TokenList tokens={notation}/></td>
			<td>{inner && '...'}<TokenList tokens={opstack}/></td>
			<td>{actionDesc}</td>
			<td>{description}</td>
		</tr>)

		tokElm.classList.remove('token-hl')
	}
	const nodeRes = nodeItrRes.value
	if (nodeRes.error) {
		if (nodeRes.token) {
			nodeTokenElmList.get(nodeRes.token)?.classList.add('token-error')
			tokensElmList.get(nodeRes.token)?.classList.add('token-error')
		}
		errorText(nodeRes.message)
		return
	}

	const notation = nodeRes.notation
	notationElm.replaceChildren(...notation.map(v => nodeTokenElmList.get(v) ?? ''))
	opstackElm.replaceChildren()

	updateText('', '')

	// loop evaluator
	if (nodeRes.isEvaluable) {
		let evalIterator = mathParser.iterateEvaluateRPN(notation)[Symbol.iterator]()
		let evalItrRes
		while (!(evalItrRes = evalIterator.next()).done) {
			const { value, valueStack, type, token, inner } = evalItrRes.value
			if (type === 'updateStack') {
				updateText('', '')
				resultStackElm.replaceChildren(...valueStack.map(v => <span>{v}</span>))
				if (inner) resultStackElm.prepend(<span>...</span>)
				yield 'eval'
				continue
			}

			const tokElm = nodeTokenElmList.get(token)
			tokElm?.classList.add('token-hl')
			const elm = tokensElmList.get(token)
			elm?.classList.add('token-hl')

			switch (type) {
				case 'insertValue':
				case 'funcCall': {
					const elm = <span>{value}</span>
					resultStackElm.appendChild(elm)
					elm.classList.add('token-hl-blue')
					yield 'eval'
					elm.classList.remove('token-hl-blue')
				} break
				case 'operation': {
					updateText(`${valueStack.at(-2)} ${token.token} ${valueStack.at(-1)} = ${value}`, '')

					const elm = <span>{value}</span>
					resultStackElm.appendChild(elm)
					const child = resultStackElm.children
					const lvalue = child.item(child.length-3)
					const rvalue = child.item(child.length-2)

					elm.classList.add('token-hl-blue')
					lvalue?.classList.add('token-hl-red')
					rvalue?.classList.add('token-hl-red')
					yield 'eval'

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
			nodeTokenElmList.get(evalRes.token)?.classList.add('token-error')
			tokensElmList.get(evalRes.token)?.classList.add('token-error')

			errorText(evalRes.message)
			return
		}

		updateText(`Output: ${evalRes}`, '')
	} else {
		resultStackElm.replaceChildren('Not evaluable')
	}

	function updateText(header: string, description: string) {
		text(header)
		desc(description)
	}
}

function Token({ token, inactive = false }: {token: MathParser.Token, inactive?: boolean}) {
	const e = <span class={'token-'+token.source}>{token.token}</span> as HTMLElement
	if (inactive) e.classList.add('token-inactive')
	return e
}

function TokenList({tokens}: {tokens?: readonly MathParser.Token[]} = {}) {
	return <code class="tokens-list">{tokens?.map(v => <Token token={v}/>)}</code> as HTMLElement
}

type Step = 'token' | 'node' | 'eval'