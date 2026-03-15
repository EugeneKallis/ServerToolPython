from fastapi.testclient import TestClient

def test_create_macro_group(client: TestClient):
    response = client.post("/macro-groups", json={"name": "Test Group", "ord": 1})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Group"
    assert data["ord"] == 1
    assert "id" in data

def test_get_macro_groups(client: TestClient):
    # Create two groups
    client.post("/macro-groups", json={"name": "Group B", "ord": 2})
    client.post("/macro-groups", json={"name": "Group A", "ord": 1})
    
    response = client.get("/macro-groups")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Check ordering
    assert data[0]["name"] == "Group A"
    assert data[1]["name"] == "Group B"

def test_get_single_macro_group(client: TestClient):
    create_res = client.post("/macro-groups", json={"name": "Single Group"})
    group_id = create_res.json()["id"]
    
    response = client.get(f"/macro-groups/{group_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Single Group"

def test_update_macro_group(client: TestClient):
    create_res = client.post("/macro-groups", json={"name": "Old Name", "ord": 1})
    group_id = create_res.json()["id"]
    
    response = client.patch(f"/macro-groups/{group_id}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    assert response.json()["ord"] == 1 # Should remain unchanged

def test_delete_macro_group(client: TestClient):
    create_res = client.post("/macro-groups", json={"name": "To Delete"})
    group_id = create_res.json()["id"]
    
    response = client.delete(f"/macro-groups/{group_id}")
    assert response.status_code == 200
    
    # Verify it's gone
    get_res = client.get(f"/macro-groups/{group_id}")
    assert get_res.status_code == 404
