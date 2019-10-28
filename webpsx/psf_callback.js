
mergeInto(LibraryManager.library, {
  // returns 0 means file is ready; -1 if file is not yet available
  psx_request_file: function(p_filename) {
    return window['psx_fileRequestCallback'](p_filename);
  },
});