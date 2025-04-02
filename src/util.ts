export function getReturnValue<V, R>(iterable: Iterable<V, R>, fn?: (value: V) => void) {
	const iterator = iterable[Symbol.iterator]()
	let res
	while (!(res = iterator.next()).done) if (fn) fn(res.value)
	return res.value
}

export function sleep(ms: number) {
	return new Promise(res => setTimeout(res, ms))
}