import { inputState, nodeState, textState, valueState } from "./lib/state";
import mathParser, { MathParser } from "./lib/mathparser";
import { RowNameValue, StateButton, Table, Token, TokenList } from "./lib/components";
import { sleep } from "./lib/util";
import PromiseController from "./lib/prmctrl";

const inputExpr = inputState<string>('(-3+1)-(-1*-8)*(8/-4)+2/8*4-16/4+4')
const resultElm = nodeState()
let updateInterval = inputState<number>(100)
let paused = valueState<boolean>(false)
let mode = inputState<'rpn' | 'pn'>('rpn')
let proc: Processor | undefined

const links = [
	['Shunting Yard', 'https://en.wikipedia.org/wiki/Shunting_yard_algorithm'],
	['RPN (Reverse Polish Notation)', 'https://en.wikipedia.org/wiki/Reverse_Polish_notation'],
	['PN (Polish Notation)', 'https://en.wikipedia.org/wiki/Polish_notation'],
	['Order of operations', 'https://en.wikipedia.org/wiki/Order_of_operations#Programming_languages']
]

document.body.append(<>
	<div class="flex-col align-center gap-8">
		<div class="fill-x flex-row">
			Input: <input
				class="fill-x"
				type="text"
				value={inputExpr()}
				onChange={inputExpr.input}
				onKeyDown={ev => {
					if (ev.key !== 'Enter') return
					ev.preventDefault()
					start()
				}}
			/>
		</div>
		<div class="flex-row gap-8">
			<span>
				Interval:
				<input style={{width: '60px'}} type="number" min={1} onChange={updateInterval.input} value={updateInterval()}/>
				ms
			</span>
			<span>
				Mode:
				<select onChange={mode.input} value={mode()}>
					<option value="rpn">RPN</option>
					<option value="pn">PN</option>
				</select>
			</span>
			<button onClick={start}>start</button>
			<StateButton textState="pause" onClick={(ev, state) => {
				const pause = paused(!paused())
				if (!pause) step()
				state(pause ? 'resume' : 'pause')
			}}/>
			<button onClick={step}>step</button>
		</div>
	</div>
	{resultElm()}
	<div class="flex-sep"/>
	<footer>
		<ul>
			{links.map(([name, link]) => <li><a href={link} target="_blank">{name}</a></li>)}
		</ul>
		<h2>Shunting Yard Visualizer</h2>
	</footer>
</>)

function step() {
	proc?.step()
}

function start() {
	proc?.abort()

	proc = new Processor(inputExpr(), mode() === 'pn')
	proc.paused = paused
	proc.interval = updateInterval
	resultElm(proc.render())
	proc.startProcess()
}

class Processor {
	constructor(input: string, isPN = false) {
		this.input = input
		this.isPN = isPN
	}
	input: string
	isPN: boolean

	tokensElm = TokenList({})
	notationElm = TokenList({})
	opstackElm = TokenList({})
	resultStackElm = TokenList({})

	textState = textState()
	descState = textState()
	errorTextState = textState()

	notationLog = document.createElement('tbody')

	tokens: MathParser.Token[] = []
	notation: MathParser.Token[] = []
	tokensElmList: TokensElmList = new Map
	notationElmList: TokensElmList = new Map

	aborted = false
	paused = valueState<boolean>(false)
	interval = valueState<number>(100)
	stepPrm = new PromiseController<void>()

	async startProcess() {
		for (const _ of this.process()) {
			if (this.aborted) return
			if (this.paused()) await this.stepPrm
			else await Promise.race([sleep(updateInterval()), this.stepPrm])
		}
	}

	step() {
		if (!this.paused()) return
		this.stepPrm.resolve()
		this.stepPrm = new PromiseController
	}

	abort() {
		if (this.aborted) return
		this.aborted = true
		this.stepPrm.reject(Error('aborted'))
	}

	renderTable() {
		return <Table class="process-table fill" colWidths={['8em', '10px']}>
			<tbody>
				{RowNameValue('Input', this.tokensElm)}
				{RowNameValue(this.isPN ? 'PN' : 'RPN', this.notationElm)}
				{RowNameValue('Operator stack', this.opstackElm)}
				{RowNameValue('Result stack', this.resultStackElm)}
			</tbody>
		</Table>
	}

	renderTextDesc() {
		return <div class="margin-y">
			<code class="error">{this.errorTextState()}</code>
			<h3>: {this.textState()}</h3>
			<small>: {this.descState()}</small>
		</div>
	}

	renderNotationLog() {
		return <details class="fill-x">
			<summary>{this.isPN ? 'PN' : 'RPN'} Log</summary>
			<Table fillX
				rowHoverEffects
				colWidths={['5%', '45%', '10%', '10%', '5%', '25%']}
				headTitles={['Input', this.isPN ? 'PN (Reversed)' : 'RPN', 'Operator Stack', 'Action', 'Op.', 'Description']}
			>{this.notationLog}</Table>
		</details>
	}

	render() {
		return <div class="flex-col process">
			{this.renderTable()}
			{this.renderTextDesc()}
			{this.renderNotationLog()}
		</div>
	}

	*process() {
		try {
			const a = yield* this.processTokenParse()
			if (a !== true) {
				this.tokensElm.replaceChildren(<span>{this.input.slice(0, a.index)}<span class="token-error">{this.input.slice(a.index)}</span></span>)
				return this.errorTextState(a.message)
			}

			const b = yield* this.processNotationBuilder()
			if (b !== true) return this.errorTextState(b.message)

			const e = mathParser.isEvaluable(this.tokens)
			if (e === true) {
				const c = yield* this.processEval()
				if (c.error) return this.errorTextState(c.message)

				this.updateText(`Output: ${c.output}`)
			} else {
				this.tokensElmList.get(e)?.classList.add('token-warn')
				this.updateText('Output not evaluable', 'Unknown function / constant')
			}
		} catch(e) {
			this.errorTextState(e instanceof Error ? e.toString() + '\n' + e.stack : String(e))
		}
	}

	*processTokenParse() {
		// tokenize expression
		const tokensRes = mathParser.tokenize(this.input)
		if (tokensRes.error) return tokensRes
		const tokens = this.tokens = tokensRes.tokens

		// put inactive tokens into result
		for (const token of tokens) {
			const elm = <Token token={token} inactive/>
			this.tokensElm.append(elm)
			this.tokensElmList.set(token, elm)
		}

		// animate tokens
		for (const elm of this.tokensElmList.values()) {
			elm.classList.add('token-hl')
			yield
			elm.classList.remove('token-hl', 'token-inactive')
		}

		return true
	}

	*processNotationBuilder() {
		const {isPN, tokensElmList, notationElm, opstackElm, notationLog, notationElmList} = this

		// loop notation builder
		let notationItr = mathParser.iterateBuildNotation(this.tokens, isPN)[Symbol.iterator]()
		let notationItrRes
		while (!(notationItrRes = notationItr.next()).done) {
			const { type, description, token, insertingToken, notation, opstack } = notationItrRes.value
			let elm = notationElmList.get(token)
			if (!elm) notationElmList.set(token, elm = <Token token={token}/>)
			const tokElm = tokensElmList.get(token)!
			const insTokElm = insertingToken && tokensElmList.get(insertingToken)

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
					actionDesc = 'lookup operator'
					this.updateText('Lookup operator', description)
					yield
				break
				case 'insertValue':
				case 'insertOpStack':
					actionDesc = type === 'insertValue' ? 'push value' : 'push operator'

					this.updateText(type === 'insertValue' ? 'Insert value' : 'Insert operator', description)
					elm.classList.add('token-hl-blue')
					yield

					elm.classList.remove('token-hl-blue')
				break
				case 'popMoveOpStack': {
					actionDesc = 'move operator'
					this.updateText('Move last operator to RPN', description)

					const elm2 = opstackElm.appendChild(elm.cloneNode(true))
					elm2.classList.add('token-hl-red')
					elm.classList.add('token-hl-blue')
					yield

					elm2.remove()
					elm.classList.remove('token-hl-blue')
				} break
				case 'popOpStack': {
					actionDesc = 'move operator'
					this.updateText('Delete last operator', description)

					opstackElm.appendChild(elm)
					elm.classList.add('token-hl-red')
					yield

					elm.remove()
				} break
			}

			if (type !== 'lookup') notationLog.append(<tr
				onMouseEnter={() => {
					elm.classList.add('token-hl')
					tokElm.classList.add('token-hl')
					if (insTokElm && insTokElm !== tokElm) insTokElm.classList.add('token-hl-blue')
				}}
				onMouseLeave={() => {
					elm.classList.remove('token-hl')
					tokElm.classList.remove('token-hl')
					if (insTokElm && insTokElm !== tokElm) insTokElm.classList.remove('token-hl-blue')
				}}
			>
				<td>{insertingToken && <Token token={insertingToken}/>}</td>
				<td><TokenList tokenOptions={{funcCall: true}} tokens={notation}/></td>
				<td><TokenList tokenOptions={{funcCall: true}} tokens={opstack}/></td>
				<td>{actionDesc}</td>
				<td><Token token={token}/></td>
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

		const notation = this.notation = nodeRes.notation
		notationElm.replaceChildren(...notation.map(v => notationElmList.get(v) ?? ''))
		opstackElm.replaceChildren()

		this.updateText()

		return true
	}

	*processEval() {
		const { isPN, resultStackElm, notationElmList, tokensElmList, notation } = this

		let evalIterator = mathParser.iterateEvaluateNotation(notation, isPN)[Symbol.iterator]()
		let evalItrRes
		while (!(evalItrRes = evalIterator.next()).done) {
			const { value, valueStack, type, token, inner } = evalItrRes.value
			if (type === 'updateStack') {
				this.updateText()
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
					let lvalue = valueStack.at(-2)
					let rvalue = valueStack.at(-1)
					if (isPN) [lvalue, rvalue] = [rvalue, lvalue]

					this.updateText(`${lvalue} ${token.token} ${rvalue} = ${value}`)

					const elm = <span>{value}</span>
					resultStackElm.appendChild(elm)
					const child = resultStackElm.children
					let lvalueElm = child.item(child.length-3)
					let rvalueElm = child.item(child.length-2)

					elm.classList.add('token-hl-blue')
					lvalueElm?.classList.add('token-hl-red')
					rvalueElm?.classList.add('token-hl-red')
					yield

					elm.classList.remove('token-hl-blue')
					lvalueElm?.classList.remove('token-hl-red')
					rvalueElm?.classList.remove('token-hl-red')
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

	updateText(title = '', desc = '') {
		this.textState(title)
		this.descState(desc)
	}
}

type TokensElmList = Map<MathParser.Token, Element>
