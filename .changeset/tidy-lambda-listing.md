---
'@cloudburn/sdk': patch
cloudburn: patch
---

Load Lambda configuration through paginated `ListFunctions` calls so read-only roles can evaluate Lambda discovery rules without `GetFunctionConfiguration` access.
