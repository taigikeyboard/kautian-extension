.PHONY: all install data js build test bench package clean

# Full pipeline: dataset + content-script bundle
all: build

install:
	npm install

# kautian.csv + kautian.ods → data/kautian.min.json (+ QA report)
data:
	npm run build:data

# esbuild bundle → dist/content.js + dist/content.css
js:
	npm run build:js

build:
	npm run build

# unit + golden tests (golden tests need `make data` first)
test:
	npm test

bench:
	npm run bench

# store upload zip (runs a full build first)
package:
	npm run package

clean:
	rm -rf data dist sutian-plus.zip
