.onAttach <- function(libname, pkgname) {
  ns <- asNamespace(pkgname)
  pkg_env <- as.environment(paste0("package:", pkgname))

  dataset_names <- get0("pythonly_dataset_names", envir = ns, ifnotfound = character(0))

  if (!is.character(dataset_names) || length(dataset_names) == 0) {
    return(invisible(NULL))
  }

  for (nm in dataset_names) {
    if (!is.character(nm) || length(nm) != 1 || !nzchar(nm)) next
    if (!identical(make.names(nm), nm)) next

    if (exists(nm, envir = pkg_env, inherits = FALSE)) next

    makeActiveBinding(
      nm,
      local({
        name <- nm
        loaded <- FALSE
        value <- NULL

        function() {
          if (!loaded) {
            e <- new.env(parent = emptyenv())
            utils::data(list = name, package = pkgname, envir = e)
            if (!exists(name, envir = e, inherits = FALSE)) {
              stop("Dataset not found in package data/: ", name, call. = FALSE)
            }
            value <<- get(name, envir = e, inherits = FALSE)
            loaded <<- TRUE
          }
          value
        }
      }),
      env = pkg_env
    )
  }

  invisible(NULL)
}

