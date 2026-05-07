// Rewrite clean SPA paths to their index.html so S3 serves pre-built static files.
// /exams           -> /exams/index.html
// /exams/AI-901    -> /exams/AI-901/index.html
// /                -> handled by CloudFront default_root_object (index.html)
// /assets/foo.js   -> unchanged (has extension)
// /favicon.ico     -> unchanged (has extension)
function handler(event) {
  var uri = event.request.uri;
  if (uri.endsWith('/')) {
    event.request.uri = uri + 'index.html';
  } else if (!uri.includes('.')) {
    event.request.uri = uri + '/index.html';
  }
  return event.request;
}
