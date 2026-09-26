from src.extraction.engine import ExtractionEngine
from src.models.schema import EntityType, SourceMetadata, generate_id


def test_llm_entities_are_not_preindexed_and_relation_types_are_inferred():
    engine = ExtractionEngine()
    source = SourceMetadata(
        source_type="text",
        file_name="synthetic.txt",
        file_hash="sha256:test",
        ingestion_time="2026-09-26T00:00:00",
    )
    parsed = {
        "entities": [
            {"name": "Example Witness", "type": "PERSON"},
            {"name": "0000000000", "type": "PHONE"},
            {"name": "Example Location", "type": "LOCATION"},
        ],
        "relations": [
            {"source": "Example Witness", "target": "0000000000", "type": "CALLED"},
        ],
    }

    entities, relations = engine._convert_llm_parsed(
        parsed, source, {"provider": "groq"}
    )

    assert len(entities) == 3
    entities_by_name = {entity.name: entity for entity in entities}
    assert entities_by_name["0000000000"].entity_type is EntityType.PHONE
    assert entities_by_name["Example Location"].entity_type is EntityType.LOCATION
    assert all(entity.id not in engine.entity_index for entity in entities)
    assert len(relations) == 1
    assert relations[0].source_entity_id == generate_id("PERSON", "Example Witness")
    assert relations[0].target_entity_id == generate_id("PHONE", "0000000000")
