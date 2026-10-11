from app.sampling import reviewers


def test_reviewer_rotation():
    picked = reviewers()
    assert "intern" not in picked, f"intern was asked to review: {picked}"
