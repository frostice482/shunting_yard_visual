export default class PromiseController<T> {
	static resolve<T>(value: T) {
		const ctrl = new PromiseController()
		ctrl.resolve(value)
		return ctrl
	}

	constructor() {
		this.promise = new Promise((res, rej) => {
			this.resolve = res;
			this.reject = rej;
		});
	}

	readonly promise: Promise<T>;

	declare resolve: (value: T | PromiseLike<T>) => void;
	declare reject: (reason?: unknown) => void;

	/** {@link Promise.then} */
	then<A = T, B = never>(onfulfilled?: { (value: T): A | PromiseLike<A> } | null, onrejected?: { (reason: unknown): B | PromiseLike<B> } | null) {
		return this.promise.then(onfulfilled, onrejected);
	}
}