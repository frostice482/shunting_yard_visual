class Tokenizer {
	constructor(
		syntaxes: Iterable<Tokenizer.Syntax> = [],
		nextSets: Iterable<{0: string, 1: Iterable<string>}> | Record<string, Iterable<string>> = [],
		entry = ''
	) {
		for (const s of syntaxes) {
			if (!s.pattern.sticky)  throw TypeError(`Pattern ${s.name} (${s.pattern}) does not have sticky flag`)
			this.syntaxes.set(s.name, s)
		}
		for (const {0: k, 1: set} of Symbol.iterator in nextSets ? nextSets : Object.entries(nextSets)) {
			this.nextSets.set(k, new Set(set))
		}
		this.entry = entry
	}

	syntaxes = new Map<string, Tokenizer.Syntax>()
	nextSets = new Map<string, Set<string>>()
	entry = ''

	addSyntax(name: string, pattern: string | RegExp, next: string[], opts?: Omit<Tokenizer.Syntax, 'name' | 'pattern' | 'next'>) {
		if (typeof pattern === 'string') pattern = RegExp(pattern, 'y')
		else if (!pattern.sticky) throw Error(`RegEx ${pattern} requires sticky flag`)

		const syn: Tokenizer.Syntax = { name, pattern, next, ...opts }
		this.syntaxes.set(name, syn)
		return syn
	}

	addNextSet(name: string, sets: Iterable<string>) {
		this.nextSets.set(name, new Set(sets))
		return this
	}

	parse(arg: string, sameIndexLimit = 100): Tokenizer.Success | Tokenizer.Error {
		const {map, nextSet} = this.buildSyntaxMap()
		let syntaxes: Tokenizer.SyntaxMapped[]

		const entry = map.get(this.entry)
		if (entry) syntaxes = [entry]
		else {
			const entry2 = nextSet[this.entry]
			if (entry2) syntaxes = entry2
			else throw ReferenceError(`Unknown syntax entry ${this.entry}`)
		}

		const tokens: Tokenizer.Token[] = []
		let i = 0, c = 0
		while (i < arg.length) {
			if (!syntaxes.length) return error('Expecting EOF')

			let hasMatch = false
			for (const syntax of syntaxes) {
				const p = syntax.pattern
				p.lastIndex = i
				const match = arg.match(p)
				if (!match) continue

				const token: Tokenizer.Token = {
					source: syntax.sourceName ?? syntax.name,
					match,
					token: match[0],
				}
				const ni = syntax.exec?.(match, token, tokens, arg) ?? p.lastIndex
				if (ni === i) {
					if (c++ > sameIndexLimit) throw Error(`infinite loop after ${sameIndexLimit} iterations at index ${i}`)
				}
				else c = 0

				i = ni
				if (!syntax.ignore) tokens.push(token)
				syntaxes = syntax.next
				hasMatch = true
				break
			}

			if (!hasMatch) return error(`Expecting ${syntaxes.map(v => v.name).join(', ')}`)
		}

		return {
			error: false,
			tokens
		}

		function error(msg: string, source: string[] = syntaxes.map(v => v.name)): Tokenizer.Error {
			return {
				error: true,
				index: i,
				source,
				message: msg
			}
		}
	}

	protected buildSyntaxMap() {
		const map = new Map<string, Tokenizer.SyntaxMapped>()
		const nextSet: Record<string, Tokenizer.SyntaxMapped[]> = Object.create(null)
		for (const name of this.syntaxes.keys()) map.set(name, {} as never)
		for (const [setName, set] of this.nextSets) {
			nextSet[setName] = []
			for (const name of set) {
				const syn = map.get(name)
				if (!syn) throw ReferenceError(`Nameset ${setName} referes to noexistent syntax ${name}`)
				nextSet[setName]!.push(syn)
			}
		}

		for (const syntax of this.syntaxes.values()) {
			const next = new Set<Tokenizer.SyntaxMapped>()
			for (const nextName of syntax.next) {
				let exist = false
				const nextSyntax = map.get(nextName)
				if (nextSyntax) {
					next.add(nextSyntax)
					exist = true
				}

				const nextSyntaxSet = nextSet[nextName]
				if (nextSyntaxSet) {
					for (const syn of nextSyntaxSet) next.add(syn)
					exist = true
				}

				if (!exist) throw ReferenceError(`Syntax ${syntax.name} refers to nonexistent syntax ${nextName}`)
			}
			Object.assign(map.get(syntax.name)!, { ...syntax, next: Array.from(next) })
		}

		return {map, nextSet}
	}

	clone() {
		return new Tokenizer(
			Array.from(this.syntaxes.values(), v => ({...v})),
			Array.from(this.nextSets, ([k, v]) => [k, Array.from(v)] as [string, string[]]),
			this.entry
		)
	}
}

declare namespace Tokenizer {
	interface Syntax {
		name: string
		pattern: RegExp
		next: string[]
		exec?: Exec
		ignore?: boolean
		sourceName?: string
	}

	interface SyntaxMapped extends Omit<Syntax, 'next'> {
		next: SyntaxMapped[]
	}

	interface TokenMin {
		source: string
		token: string
	}

	interface Token extends TokenMin {
		match: RegExpMatchArray
		[k: string]: any
	}

	interface Success<T = Token> {
		error: false
		tokens: T[]
	}

	interface Error {
		error: true
		source: string[]
		message: string
		index: number
	}

	type Result<T = Token> = Success<T> | Error

	type Exec = (match: RegExpMatchArray, token: Token, tokens: Token[], input: string) => void | number
}

export default Tokenizer
