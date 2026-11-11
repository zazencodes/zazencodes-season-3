# Messy Folder Cleanup

## Demo

```bash
# Clean up (if demo exists already)
rm -r example_business_project
rm -r vegan_icecream_example_project

# Create reference demo
pip install openpyxl
python make_demo.py

# Clean up with agent and create skill
claude
# ...

# Create new project to test skill
python make_vegan_icecream_demo.py

# Run skill on new project
claude
# ...
```
