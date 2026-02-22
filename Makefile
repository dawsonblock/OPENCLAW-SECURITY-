.PHONY: bench-convenience bench-reliability bench-security bench-capability

bench-convenience:
	@bash scripts/benchmarks.sh convenience

bench-reliability:
	@bash scripts/benchmarks.sh reliability

bench-security:
	@bash scripts/benchmarks.sh security

bench-capability:
	@bash scripts/benchmarks.sh capability
