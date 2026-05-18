fmt:
	cargo fmt --all

check:
	cargo check --workspace

test:
	cargo test --workspace

lint:
	cargo clippy --workspace -- -D warnings

repomix:
	mkdir -p repomix
	docker run -v .:/app -it --rm ghcr.io/yamadashy/repomix \
		--output repomix/repomix-output-$(shell date +%Y%m%d-%H%M).xml
