import { DetailedHTMLProps, HTML } from "jsx-dom"

declare module 'jsx-dom' {
	interface CSSProperties {
		[k: `--${string}`]: string | number
	}
}

declare global {
	declare module '*.scss' {}

	declare module '*?url' {
		const t: string
		export default t
	}

	declare module '*?raw' {
		const t: string
		export default t
	}

	type ReadonlyRecord<K, V> = { readonly [X in K]: V }
	type IterablePair<K, V> = Iterable<readonly [K, V]>
	type RecordOrIterablePair<K, V> = ReadonlyRecord<K, V> | IterablePair<K, V>
	type PartialReadonly<O> = { readonly [K in keyof O]?: O[K] }

	type URLSearchParamsInit = string[][] | Record<string, string> | string | URLSearchParams

	interface NodeObject {
		readonly rootNode: Node
	}

	interface Node {
		cloneNode(deep?: boolean): this
	}

	type IfError<V, E> = {error: true} & E | {error: false} & V
}
