.PHONY: r-data r-doc r-publish

R_PKG_DIR := r/pythonly

r-data:
	Rscript $(R_PKG_DIR)/data-raw/build_data.R

r-doc:
	Rscript -e "devtools::document('$(R_PKG_DIR)')"

r-publish: r-data r-doc
	git add \
		$(R_PKG_DIR)/DESCRIPTION \
		$(R_PKG_DIR)/NAMESPACE \
		$(R_PKG_DIR)/R \
		$(R_PKG_DIR)/data \
		$(R_PKG_DIR)/man
	git status --porcelain
	@echo "Now commit and push manually (or use the publisher script from the app repo)."

