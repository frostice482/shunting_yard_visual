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

	iterateBuildRPN(tokens: ArrayLike<MathParser.Token>) {
		return this.internalBuildRPN(tokens, true)
	}

	iterateEvaluateRPN(rpn: ArrayLike<MathParser.Token>) {
		return this.internalEvaluateRPN(rpn, true)
	}

	buildRPN(tokens: ArrayLike<MathParser.Token>) {
		return getReturnValue(this.internalBuildRPN(tokens))
	}

	evaluateRPN(rpn: ArrayLike<MathParser.Token>) {
		return getReturnValue(this.internalEvaluateRPN(rpn))
	}

	protected *internalBuildRPN(tokens: ArrayLike<MathParser.Token>, stepping = false): Generator<MathParser.NotationStep, MathParser.NotationResult> {
		const opstack: MathParser.Token[] = []
		const rpn: MathParser.Token[] = []
		let evaluable = true

		const bracketStack: number[] = []

		let i = 0;
		loop:
		for (; i < tokens.length; i++) {
			const token = tokens[i]!
			switch (token.source) {
				case 'number':
				case 'variable':
				case 'funcCall':
					if (token.source === 'variable' && this.constants[token.token] === undefined) evaluable = false
					rpn.push(token)
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
						rpn.push(lastOp)
						if (stepping) yield step('popMoveOpStack', `Higher precedence: ${op} (${level}) ${lastOpData.rtl ? '>' : '>='} ${lastOp.token} (${lastOpData.level})`, lastOp)
					}

					opstack.push(token)
					if (stepping) yield step('insertOpStack')
				break

				case 'openBracket':
					opstack.push(token)
					bracketStack.push(rpn.length)
					if (stepping) yield step('insertOpStack', 'Inserting open bracket')
				break

				case 'closeBracket': {
					const lastBracket = bracketStack.pop()
					if (lastBracket === undefined) return error(`Unexpected ")"`)

					const r = yield* popStackUntilBracket(true)
					if (r) return r

					const fnCall = rpn[lastBracket-1]
					if (fnCall?.source === 'funcCall') {
						fnCall.params.push(rpn.splice(lastBracket))
						if (stepping) yield step('updateParams', undefined, fnCall)
					}
				} break

				case 'argumentSeparator': {
					const lastBracket = bracketStack.at(-1)
					if (lastBracket === undefined) return error(`Unexpected ","`)
					const fnCall = rpn[lastBracket-1]
					if (!fnCall || fnCall.source !== 'funcCall') return error(`Unexpected ","`)

					const r = yield* popStackUntilBracket(false)
					if (r) return r

					fnCall.params.push(rpn.splice(lastBracket))
				} break

				default:
					return error('Unknown token')
			}
		}

		if (!stepping) rpn.push(...opstack.reverse())
		else {
			while (opstack.length) {
				const op = opstack.pop()!
				rpn.push(op)
				yield step('popMoveOpStack', 'Leftover operator', op)
			}
		}

		return {
			error: false,
			notation: rpn,
			isEvaluable: evaluable
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
				notation: rpn,
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
				rpn.push(lastOp)
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

	protected *internalEvaluateRPN(rpn: ArrayLike<MathParser.Token>, stepping = false, inner = false): Generator<MathParser.EvalStep, number | MathParser.EvalError> {
		const valueStack: number[] = []
		let i = 0

		if (inner && stepping) yield step('updateStack', 0)

		for (; i < rpn.length; i++) {
			const token = rpn[i]!
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
					for (const rpn of token.params) {
						let itr = this.internalEvaluateRPN(rpn, stepping, true)[Symbol.iterator]()
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

					v = op.fn(v1, v2)
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
				token: rpn[i]!,
				valueStack
			}
		}

		function step(type: MathParser.EvalStepType, value: number): MathParser.EvalStep {
			return {
				index: i,
				token: rpn[i]!,
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
		isEvaluable: boolean
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
