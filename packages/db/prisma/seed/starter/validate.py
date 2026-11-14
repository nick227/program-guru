#!/usr/bin/env python3
"""Validate domain/category, relationship, Place and tier-free starter JSON."""
import json
from pathlib import Path
folder=Path(__file__).resolve().parent
catalog=json.loads((folder/'catalog.json').read_text())
seed=json.loads((folder/'examples.json').read_text())
valid={(d['slug'],c['slug']) for d in catalog['domains'] for c in d['categories']}
assert len(valid)==sum(len(d['categories']) for d in catalog['domains'])
assert len({d['slug'] for d in catalog['domains']})==len(catalog['domains'])
activities=seed['activities']; programs=seed['programs']; places=seed['places']
aids=[a['id'] for a in activities];pids=[p['id'] for p in programs];placeids=[p['id'] for p in places]
assert len(aids)==len(set(aids)) and len(pids)==len(set(pids)) and len(placeids)==len(set(placeids))
for entity in activities+programs:
 assert (entity['domain'],entity['category']) in valid,entity['id']
 assert 'tier' not in entity and 'focus' not in entity,entity['id']
for p in programs:
 assert set(p['activityIds'])<=set(aids),p['id']
 for e in p['dependencies']:
  assert e['before'] in p['activityIds'] and e['after'] in p['activityIds'],p['id']
for a in activities:
 place=a.get('location',{}).get('placeId')
 if place: assert place in placeids,a['id']
 assert len({i['order'] for i in a['instructions']})==len(a['instructions'])
print(f"Valid: {len(catalog['domains'])} domains, {len(valid)} categories, {len(activities)} activities, {len(programs)} programs, {len(places)} places")
