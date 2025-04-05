import Tokenizer from "./tokenizer";
import { getReturnValue } from "./util";

// math functions
const functions: Record<string, MathParser.MathFunc> = {
	ln: Math.log,
	log: (num, base = 10) => Math.log(num) / Math.log(base),
	sqrt: (num, base = 2) => num ** (1 / base)
}
Object.setPrototypeOf(functions, null)
const mathFunc: {[K in keyof Math]: Math[K] extends MathParser.MathFunc ? K : never}[keyof Math][] = [
	'sin','cos','tan','sinh','cosh','tanh','asin','acos','atan','asinh','acosh','atanh','ceil','floor','round','trunc','fround','abs','sign','exp','expm1','random','max','min'
]
for (const k of mathFunc) functions[k] = Math[k]

// math constants
const constants: Record<string, number> = {
	e: Math.E,
	pi: Math.PI,
	phi: (1 + Math.sqrt(5)) / 2,
	epsilon: Number.EPSILON,
	inf: Number.POSITIVE_INFINITY,
	minInf: Number.NEGATIVE_INFINITY
}
Object.setPrototypeOf(constants, null)

// operators
const operators: Record<string, MathParser.Operator> = Object.create(null)
const operatorInit: Array<Record<string, Omit<MathParser.Operator, 'level'>>> = [
	{
		'^': {fn: (a, b) => a ** b, rtl: true},
	}, {
		'*': {fn: (a, b) => a * b},
		'×': {fn: (a, b) => a * b},
		'/': {fn: (a, b) => a / b},
		'÷': {fn: (a, b) => a / b},
		'%': {fn: (a, b) => a % b},
	}, {
		'+': {fn: (a, b) => a + b},
		'-': {fn: (a, b) => a - b},
	}, {
		'<<':{fn:  (a, b) => a << b},
		'>>':{fn:  (a, b) => a >> b},
	}, {
		'&': {fn: (a, b) => a & b},
		'|': {fn: (a, b) => a | b},
	}
]
for (const [i, ops] of operatorInit.entries()) {
	for (const [k, v] of Object.entries(ops)) {
		operators[k] = { level: i, ...v }
	}
}

const mathTokenizer = new Tokenizer([{
	name: 'number',
	pattern: /[-+]?\d+(\.\d*)?(e[-+]\d+)?/y,
	next: ['operator']
}, {
	name: 'variable',
	pattern: /[a-z]\w*/yi,
	next: ['operator']
}, {
	name: 'funcCall',
	pattern: /[a-z]\w*(?=\s*\()/yi,
	next: ['openBracket'],
	exec(match, token) {
		token.params = []
	},
}, {
	name: 'openBracket',
	pattern: /\s*\(\s*/y,
	next: ['value']
}, {
	name: 'closeBracket',
	pattern: /\s*\)\s*/y,
	next: ['operator']
}, {
	name: 'argumentSeparator',
	pattern: /,/y,
	next: ['value']
}, {
	name: 'operatorToken',
	sourceName: 'operator',
	pattern: /[-+*/&|×÷^]|<<|>>/y,
	next: ['value']
}, {
	name: 'value',
	pattern: /\s*/y,
	next: ['openBracket', 'closeBracket', 'number', 'funcCall', 'variable'],
	ignore: true
}, {
	name: 'operator',
	pattern: /\s*/y,
	next: ['closeBracket', 'argumentSeparator', 'operatorToken'],
	ignore: true
}], undefined, 'value')

export class MathParser {
	functions = {...functions}
	constants = {...constants}
	operators = {...operators}

	tokenizer = new Tokenizer(mathTokenizer.syntaxes.values(), mathTokenizer.nextSets, mathTokenizer.entry)

	tokenize(expr: string) {
		return this.tokenizer.parse(expr) as Tokenizer.Result<MathParser.Token>
	}

	iterateBuildNotation(tokens: ArrayLike<MathParser.Token>, pn = false) {
		return pn ? this.internalBuildPN(tokens, true) : this.internalBuildRPN(tokens, true)
	}

	iterateEvaluateNotation(notation: ArrayLike<MathParser.Token>, pn = false) {
		return this.internalEvaluateNotation(notation, pn, true)
	}

	buildNotation(tokens: ArrayLike<MathParser.Token>, pn = false) {
		return getReturnValue(pn ? this.internalBuildPN(tokens) : this.internalBuildRPN(tokens))
	}

	evaluateNotatiom(notation: ArrayLike<MathParser.Token>, pn = false) {
		return getReturnValue(this.internalEvaluateNotation(notation, pn))
	}

	isEvaluable(tokens: ArrayLike<MathParser.Token>): true | MathParser.Token {
		for (let i = 0; i < tokens.length; i++) {
			const tok = tokens[i]!
			switch (tok.source) {
				case 'variable':
					if (this.constants[tok.token] === undefined) return tok
				break
				case 'funcCall':
					if (this.functions[tok.token] === undefined) return tok
				break
			}
		}
		return true
	}

	protected *internalBuildRPN(tokens: ArrayLike<MathParser.Token>, stepping = false): Generator<MathParser.NotationStep, MathParser.NotationResult> {
		const opstack: MathParser.Token[] = []
		const notation: MathParser.Token[] = []

		const bracketStack: number[] = []

		let i = 0;
		loop:
		for (; i < tokens.length; i++) {
			const token = tokens[i]!
			switch (token.source) {
				case 'number':
				case 'variable':
				case 'funcCall':
					notation.push(token)
					if (stepping) yield step('insertValue')

					if (token.source === 'funcCall' && tokens[i+1]?.source !== 'openBracket') return error(`Expecting open bracket`, i+1)
				break

				case 'operator':
					const op = token.token
					const level = this.operators[op]?.level
					if (level === undefined) return error(`Invalid operator "${op}"`)

					if (stepping) yield step('lookup')

					let lastOp, lastOpData
					while (
						(lastOp = opstack.at(-1)) !== undefined // there is operator in the stack
						&& (lastOpData = this.operators[lastOp.token]) !== undefined // operator has level
						&& (lastOpData.rtl ? lastOpData.level < level : lastOpData.level <= level) // difference in precedence
					) {
						opstack.pop()
						notation.push(lastOp)
						if (stepping) yield step('popMoveOpStack', `Higher precedence: ${op} (${level}) ${lastOpData.rtl ? '>' : '>='} ${lastOp.token} (${lastOpData.level})`, lastOp)
					}

					opstack.push(token)
					if (stepping) yield step('insertOpStack')
				break

				case 'openBracket':
					opstack.push(token)
					bracketStack.push(notation.length)
					if (stepping) yield step('insertOpStack', 'Inserting open bracket')
				break

				case 'closeBracket': {
					const lastBracket = bracketStack.pop()
					if (lastBracket === undefined) return error(`Unexpected ")"`)

					const r = yield* popStackUntilBracket(true)
					if (r) return r

					const fnCall = notation[lastBracket-1]
					if (fnCall?.source === 'funcCall' && bracketStack.at(-1) !== lastBracket) {
						fnCall.params.push(notation.splice(lastBracket))
						if (stepping) yield step('updateParams', undefined, fnCall)
					}
				} break

				case 'argumentSeparator': {
					const lastBracket = bracketStack.at(-1)
					if (lastBracket === undefined) return error(`Unexpected ","`)
					const fnCall = notation[lastBracket-1]
					if (!fnCall || fnCall.source !== 'funcCall') return error(`Unexpected ","`)

					const r = yield* popStackUntilBracket(false)
					if (r) return r

					fnCall.params.push(notation.splice(lastBracket))
				} break

				default:
					return error('Unknown token')
			}
		}

		if (!stepping) notation.push(...opstack.reverse())
		else {
			while (opstack.length) {
				const op = opstack.pop()!
				notation.push(op)
				yield step('popMoveOpStack', 'Leftover operator', op)
			}
		}

		return {
			error: false,
			notation: notation
		}

		function error(msg: string, index = i, token: MathParser.Token | undefined = tokens[index]): MathParser.NotationError {
			return {
				error: true,
				message: msg,
				token: token,
				index: index
			}
		}

		function step(type: MathParser.NotationStepType, description = '', token = tokens[i]!): MathParser.NotationStep {
			return {
				notation: notation,
				opstack,
				type,
				index: i,
				token,
				insertingToken: tokens[i],
				description: description
			}
		}

		function* popStackUntilBracket(popOpen = false) {
			let lastOp
			while ((lastOp = opstack.at(-1)) && lastOp.source !== 'openBracket') {
				notation.push(lastOp)
				opstack.pop()
				if (stepping) yield step('popMoveOpStack', 'Pop until open bracket is found', lastOp)
			}
			if (!lastOp) return error(`Expecting "(" at operator stack, got null`)
			if (popOpen) {
				opstack.pop()
				if (stepping) yield step('popOpStack', 'Open bracket is not included in RPN', lastOp)
			}
		}
	}

	protected *internalBuildPN(tokens: ArrayLike<MathParser.Token>, stepping = false): Generator<MathParser.NotationStep, MathParser.NotationResult> {
		const opstack: MathParser.Token[] = []
		const notation: MathParser.Token[] = []

		let prevBracket = 0
		const bracketStack: number[] = []

		let i = tokens.length-1
		loop:
		for (; i >= 0; i--) {
			const token = tokens[i]!
			switch (token.source) {
				case 'argumentSeparator': {
					if (!bracketStack.length) return error(`Unexpected ","`)

					const r = yield* popStackUntilBracket(false)
					if (r) return r
				} //break // fallthrough

				case 'number':
				case 'variable':
					notation.push(token)
					if (stepping) yield step('insertValue')
				break

				case 'operator':
					const op = token.token
					const level = this.operators[op]?.level
					if (level === undefined) return error(`Invalid operator "${op}"`)

					if (stepping) yield step('lookup')

					let lastOp, lastOpData
					while (
						(lastOp = opstack.at(-1)) !== undefined // there is operator in the stack
						&& (lastOpData = this.operators[lastOp.token]) !== undefined // operator has level
						&& (lastOpData.rtl ? lastOpData.level <= level : lastOpData.level < level) // difference in precedence
					) {
						opstack.pop()
						notation.push(lastOp)
						if (stepping) yield step('popMoveOpStack', `Higher precedence: ${op} (${level}) ${lastOpData.rtl ? '>=' : '>'} ${lastOp.token} (${lastOpData.level})`, lastOp)
					}

					opstack.push(token)
					if (stepping) yield step('insertOpStack')
				break

				case 'closeBracket':
					opstack.push(token)
					bracketStack.push(notation.length)
					if (stepping) yield step('insertOpStack', 'Inserting close bracket')
				break

				case 'openBracket': {
					const lastBracket = bracketStack.pop()
					if (lastBracket === undefined) return error(`Unexpected "("`)

					const r = yield* popStackUntilBracket(true)
					if (r) return r

					prevBracket = lastBracket
				} break

				case 'funcCall': {
					if (tokens[i+1]?.source !== 'openBracket') return error(`Expecting "("`, i+1)

					const args = notation.splice(prevBracket)

					console.log('spliace', prevBracket, args)

					let x = 0
					while ((x = args.findIndex(tok => tok.source === 'argumentSeparator')) !== -1) {
						token.params.unshift(args.splice(0, x))
						args.shift()
					}

					token.params.unshift(args)

					notation.push(token)
					if (stepping) yield step('insertValue')
					if (stepping) yield step('updateParams')
				} break

				default:
					return error('Unknown token')
			}
		}

		if (!stepping) notation.push(...opstack.reverse())
		else {
			while (opstack.length) {
				const op = opstack.pop()!
				notation.push(op)
				yield step('popMoveOpStack', 'Leftover operator', op)
			}
		}

		return {
			error: false,
			notation: notation.reverse()
		}

		function error(msg: string, index = i, token: MathParser.Token | undefined = tokens[index]): MathParser.NotationError {
			return {
				error: true,
				message: msg,
				token: token,
				index: index
			}
		}

		function step(type: MathParser.NotationStepType, description = '', token = tokens[i]!): MathParser.NotationStep {
			return {
				notation: notation,
				opstack,
				type,
				index: i,
				token,
				insertingToken: tokens[i],
				description: description
			}
		}

		function* popStackUntilBracket(popOpen = false) {
			let lastOp
			while ((lastOp = opstack.at(-1)) && lastOp.source !== 'closeBracket') {
				notation.push(lastOp)
				opstack.pop()
				if (stepping) yield step('popMoveOpStack', 'Pop until open bracket is found', lastOp)
			}
			if (!lastOp) return error(`Expecting ")" at operator stack, got null`)
			if (popOpen) {
				opstack.pop()
				if (stepping) yield step('popOpStack', 'Close bracket is not included in PN', lastOp)
			}
		}
	}

	protected *internalEvaluateNotation(notation: ArrayLike<MathParser.Token>, isPN = false, stepping = false, inner = false): Generator<MathParser.EvalStep, number | MathParser.EvalError> {
		const valueStack: number[] = []
		let i = isPN ? notation.length-1 : 0

		if (inner && stepping) yield step('updateStack', 0)

		for (; isPN ? i >= 0 : i < notation.length; i += isPN ? -1 : 1) {
			const token = notation[i]!
			let v = 0
			switch (token.source) {

				case 'number':
					v = +token.token
					if (stepping) yield step('insertValue', v)
				break

				case 'variable': {
					const constant = this.constants[token.token]
					if (!constant) return error(`Unknown constant ${token.token}`)
					v = constant
					if (stepping) yield step('insertValue', v)
				} break

				case 'funcCall': {
					const fn = this.functions[token.token]
					if (!fn) return error(`Unknown function ${token.token}`)

					const args = []
					for (const notation of token.params) {
						let itr = this.internalEvaluateNotation(notation, isPN, stepping, true)[Symbol.iterator]()
						let itrRes
						while (!(itrRes = itr.next()).done) yield itrRes.value
						const res = itrRes.value

						if (typeof res !== 'number') return res
						args.push(res)
					}

					if (stepping) yield step('updateStack', 0)

					v = fn.apply(this, args as number[])
					if (stepping) yield step('funcCall', v)
				} break

				case 'operator': {
					const v2 = valueStack.at(-1)
					const v1 = valueStack.at(-2)
					if (v1 === undefined || v2 === undefined) return error(`Missing lvalue and rvalue for operator "${token.token}"`)

					const op = this.operators[token.token]
					if (!op) return error(`Unknown operator "${token.token}"`)

					v = isPN ? op.fn(v2, v1) : op.fn(v1, v2)
					if (stepping) yield step('operation', v)

					valueStack.pop()
					valueStack.pop()
				} break

				default:
					return error('Unknown token')
			}
			valueStack.push(v)
			if (stepping) yield step('updateStack', 0)
		}

		if (valueStack.length !== 1) return error('Invalid result stack length')

		return valueStack[0] ?? NaN

		function error(msg: string): MathParser.EvalError {
			return {
				error: true,
				message: msg,
				token: notation[i]!,
				valueStack
			}
		}

		function step(type: MathParser.EvalStepType, value: number): MathParser.EvalStep {
			return {
				index: i,
				token: notation[i]!,
				valueStack,
				type,
				value,
				inner: inner
			}
		}
	}
}

const mathParser = new MathParser
export default mathParser

export declare namespace MathParser {
	interface Operator {
		level: number
		fn: OperatorFunc
		rtl?: boolean
	}
	type MathFunc = (...v: number[]) => number
	type OperatorFunc = (a: number, b: number) => number

	interface TokenTypeMap {
		openBracket: {}
		closeBracket: {}
		number: {}
		operator: {}
		variable: {}
		funcCall: {
			params: Token[][]
		}
		argumentSeparator: {}
	}

	type Token = Tokenizer.TokenMin & {[K in keyof TokenTypeMap]: {source: K} & TokenTypeMap[K]}[keyof TokenTypeMap]

	interface NotationError {
		error: true
		index: number
		token?: Token
		message: string
	}

	interface NotationSuccess {
		error: false
		notation: Token[]
	}

	type NotationResult = NotationError | NotationSuccess

	interface NotationStep {
		notation: Token[]
		opstack: Token[]
		type: NotationStepType
		index: number
		token: Token
		insertingToken?: Token
		description: string
	}

	type NotationStepType = 'insertValue' | 'insertOpStack' | 'popMoveOpStack' | 'popOpStack' | 'updateParams' | 'lookup'

	interface EvalError {
		error: true
		token: Token
		message: string
		valueStack: number[]
	}

	interface EvalStep {
		index: number
		token: Token
		valueStack: number[]
		type: EvalStepType
		value: number
		inner: boolean
	}

	type EvalStepType = 'insertValue' | 'operation' | 'funcCall' | 'updateStack'
}
